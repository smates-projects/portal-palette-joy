// BrandRepository over the real API (brand module: brand.controller.ts). Who may do what is the API's answer: only
// SM loads a brand by hand (the owner can only go back to the SM brand), so an owner calling set gets forbidden (403)
// from the API, not from here. The palette rules arrive as codes: invalid_color (not #rrggbb), contrast_too_low (AA).
import type { BrandRepository, SetBrandInput } from "../repositories";
import type { BrandEvent, BusinessBrand, Uuid } from "../types";
import type { HttpClient } from "./client";
import { dataUrlToBlob, invalidFile, isBlob, uploadFile } from "./files";

const brandPath = (businessId: Uuid) => `/businesses/${encodeURIComponent(businessId)}/brand`;

/**
 * What to do with the logo: upload new bytes (the File picked, or the data URL the capture read it into), keep the
 * stored one (an http URL the API already serves: its logo_file_id as is, or nothing and the API keeps the current
 * file), or remove it (no logo at all).
 */
type LogoPlan = { upload: Blob } | { keep: Uuid | undefined } | { remove: true };

function logoPlan(palette: SetBrandInput): LogoPlan {
  if (isBlob(palette.logo_file)) return { upload: palette.logo_file };
  const url = palette.logo_url;
  if (!url) return { remove: true };
  if (url.startsWith("data:")) {
    const blob = dataUrlToBlob(url);
    if (!blob) throw invalidFile("Pick the logo file to upload.");
    return { upload: blob };
  }
  return { keep: palette.logo_file_id ?? undefined };
}

export function createHttpBrandRepository(client: HttpClient): BrandRepository {
  return {
    /** Without a business: the signed-in person's own brand (owner and team, or a franchisee's franchisor). */
    get: (businessId) =>
      client.get<BusinessBrand | null>(businessId ? brandPath(businessId) : "/me/brand"),

    getMine: () => client.get<BusinessBrand | null>("/me/brand"),

    /**
     * Uploads a new logo (context brand) and a new manual PDF (context other: the brand context only takes images),
     * then PUT the palette with their ids. A logo or manual left unchanged is resent by its stored id
     * (logo_file_id, manual_file_id) or left out of the body, and the API keeps the current file; null removes it.
     */
    set: async (businessId, palette) => {
      if (
        palette.manual_file !== undefined &&
        palette.manual_file !== null &&
        !isBlob(palette.manual_file)
      ) {
        throw invalidFile("Pick the brand manual file to upload.");
      }
      const logo = logoPlan(palette);
      const logoFileId =
        "upload" in logo
          ? await uploadFile(client, logo.upload, {
              context: "brand",
              name: palette.logo_file?.name ?? palette.logo_file_name ?? "logo",
              businessId,
            })
          : "keep" in logo
            ? logo.keep
            : null;
      const manualFileId = palette.manual_file
        ? await uploadFile(client, palette.manual_file, { context: "other", businessId })
        : (palette.manual_file_id ?? null);
      return client.request<BusinessBrand>("PUT", brandPath(businessId), {
        body: {
          primary_color: palette.primary_color,
          accent_color: palette.accent_color,
          font_family: palette.font_family,
          // undefined is left out by JSON.stringify: the API keeps the logo it has.
          logo_file_id: logoFileId,
          manual_file_id: manualFileId,
        },
      });
    },

    reset: async (businessId) => {
      await client.delete<void>(brandPath(businessId));
    },

    listEvents: (businessId) => client.get<BrandEvent[]>(`${brandPath(businessId)}/events`),
  };
}
