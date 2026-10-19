// BrandRepository over the real API (brand module: brand.controller.ts). Who may do what is the API's answer: only
// SM loads a brand by hand (the owner can only go back to the SM brand), so an owner calling set gets forbidden (403)
// from the API, not from here. The palette rules arrive as codes: invalid_color (not #rrggbb), contrast_too_low (AA).
import type { BrandRepository } from "../repositories";
import type { BrandEvent, BusinessBrand, Uuid } from "../types";
import type { HttpClient } from "./client";
import { invalidFile, isBlob, logoBlob, uploadFile } from "./files";

const brandPath = (businessId: Uuid) => `/businesses/${encodeURIComponent(businessId)}/brand`;

export function createHttpBrandRepository(client: HttpClient): BrandRepository {
  return {
    /** Without a business: the signed-in person's own brand (owner and team, or a franchisee's franchisor). */
    get: (businessId) =>
      client.get<BusinessBrand | null>(businessId ? brandPath(businessId) : "/me/brand"),

    getMine: () => client.get<BusinessBrand | null>("/me/brand"),

    /**
     * Uploads the logo (the File, or the data URL the capture read it into) with context brand and the manual PDF
     * with context other (the brand context only takes images), then PUT the palette with their ids. A logo the API
     * already stores (an http URL) cannot be sent back by reference: invalid_file, as any other non-file.
     */
    set: async (businessId, palette) => {
      if (
        palette.manual_file !== undefined &&
        palette.manual_file !== null &&
        !isBlob(palette.manual_file)
      ) {
        throw invalidFile("Pick the brand manual file to upload.");
      }
      const logo = logoBlob(palette.logo_file, palette.logo_url);
      const logoFileId = logo
        ? await uploadFile(client, logo, {
            context: "brand",
            name: palette.logo_file?.name ?? palette.logo_file_name ?? "logo",
            businessId,
          })
        : null;
      const manualFileId = palette.manual_file
        ? await uploadFile(client, palette.manual_file, { context: "other", businessId })
        : null;
      return client.request<BusinessBrand>("PUT", brandPath(businessId), {
        body: {
          primary_color: palette.primary_color,
          accent_color: palette.accent_color,
          font_family: palette.font_family,
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
