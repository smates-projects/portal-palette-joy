// Real uploads through the API's files module (files.controller.ts, PLAN_BACKEND 3.4). Three steps:
// 1. POST /files/presign { context, original_name, mime, size_bytes, business_id? } → { file_id, upload_url, headers }.
// 2. PUT the bytes straight to object storage at upload_url with exactly those headers. Plain fetch, no cookies:
//    the URL is presigned and the storage host is not the API (sending credentials there would fail CORS).
// 3. POST /files/{id}/complete: the API queues the verification (magic bytes, scanner).
// The caller then attaches the returned file_id to its resource (document upload, contract signature).
import type { ReceiptUpload, Uuid } from "../types";
import { ApiError, type HttpClient } from "./client";

/** `files.owner_type` values the front uploads to today (FILE_CONTEXTS of the API). */
export type FileContext =
  | "intake_document"
  /** A whole contract document (the owner's own NDA, PDF). */
  | "contract"
  | "contract_signature"
  | "fund_payment"
  | "distribution_payment"
  | "task_version"
  | "task_comment"
  | "owner_request"
  | "pre_validation"
  /** Logos only (png, svg, jpg; public once applied). */
  | "brand"
  /** Any other document (pdf, png, jpg, docx, xlsx), private. */
  | "other";

interface PresignedFile {
  file_id: Uuid;
  upload_url: string;
  /** Part of the signature: sent unchanged with the PUT. */
  headers: Record<string, string>;
  expires_at: string;
}

export interface UploadOptions {
  context: FileContext;
  /** Name kept as `original_name`; defaults to the File's own name. */
  name?: string | undefined;
  /** Business the file belongs to, when known (the API checks it can be read and fills the office). */
  businessId?: Uuid | null | undefined;
}

/** Browsers sometimes leave File.type empty (unknown extension on Windows): the API needs a declared MIME. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeOf(blob: Blob, name: string): string {
  if (blob.type) return blob.type;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** A real File (or Blob) picked in an input. A file name or the mock's placeholder is not one: it has no bytes. */
export const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

/** What an adapter throws, without calling the API, when it was given a name where it needs the file itself. */
export const invalidFile = (detail: string): ApiError =>
  new ApiError({ code: "invalid_file", status: 422, detail });

/** Uploads one file and answers its id, ready to attach. Every failure is an ApiError the screens can show. */
export async function uploadFile(
  client: HttpClient,
  blob: Blob,
  options: UploadOptions,
): Promise<Uuid> {
  const name = options.name ?? (blob instanceof File ? blob.name : "file");
  const presigned = await client.post<PresignedFile>(
    "/files/presign",
    {
      context: options.context,
      original_name: name,
      mime: mimeOf(blob, name),
      size_bytes: blob.size,
      business_id: options.businessId ?? null,
    },
    { idempotent: true },
  );

  let response: Response;
  try {
    response = await globalThis.fetch(presigned.upload_url, {
      method: "PUT",
      credentials: "omit",
      headers: presigned.headers,
      body: blob,
    });
  } catch (cause) {
    throw new ApiError({
      code: "network_error",
      status: 0,
      detail: cause instanceof Error ? cause.message : null,
    });
  }
  if (!response.ok) {
    throw new ApiError({
      code: "upload_failed",
      status: response.status,
      detail: `The storage answered ${response.status} to the upload.`,
    });
  }

  await client.post(`/files/${encodeURIComponent(presigned.file_id)}/complete`);
  return presigned.file_id;
}

// ---------- Payment receipts ----------

/**
 * The receipt of a fund or distribution payment as the API wants it: the id of a file uploaded first. A real File
 * is uploaded; the `{ file_name, size_kb }` placeholder (the mock's simulated upload) has no bytes to send, so it is
 * invalid_file without calling the API. No receipt is null.
 */
export async function uploadReceipt(
  client: HttpClient,
  receipt: ReceiptUpload | null,
  context: Extract<FileContext, "fund_payment" | "distribution_payment">,
  businessId: Uuid,
): Promise<Uuid | null> {
  if (!receipt) return null;
  if (typeof Blob === "undefined" || !(receipt instanceof Blob)) {
    throw new ApiError({
      code: "invalid_file",
      status: 422,
      detail: "Pick the receipt file to upload.",
    });
  }
  return uploadFile(client, receipt, { context, businessId });
}

// ---------- Brand logos ----------

/**
 * The logo of a brand as bytes to upload: the File picked, or the data URL the capture read it into (BrandCapture
 * keeps the logo that way for the preview). Null when there is no logo. Any other URL (a logo already stored by the
 * API) has no bytes here and the API has no way to keep it by reference: invalid_file.
 */
export function logoBlob(
  file: File | null | undefined,
  url: string | null | undefined,
): Blob | null {
  if (isBlob(file)) return file;
  if (!url) return null;
  const blob = url.startsWith("data:") ? dataUrlToBlob(url) : null;
  if (!blob) throw invalidFile("Pick the logo file to upload.");
  return blob;
}

// ---------- Signature images ----------

const DATA_URL = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/s;

/** A data URL as a Blob (base64 or percent-encoded). Null when it is not a data URL. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const mime = (match[1] ?? "text/plain").toLowerCase();
  const payload = match[4] ?? "";
  if (match[3]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

const RASTERIZE_TIMEOUT_MS = 5000;

/** Draws any image data URL on a canvas and exports it as PNG. Browser only; null where there is no canvas. */
async function rasterizeToPng(dataUrl: string): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const image = new Image();
  const loaded = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), RASTERIZE_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    image.src = dataUrl;
  });
  if (!loaded) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/**
 * The signature the SignaturePad produced (a data URL) as the PNG the API accepts for `contract_signature`. Drawn
 * and typed signatures already are PNG; an uploaded JPEG or an SVG is redrawn as PNG in the browser.
 */
export async function signatureToPng(dataUrl: string): Promise<Blob> {
  const blob = dataUrlToBlob(dataUrl);
  if (blob?.type === "image/png") return blob;
  const png = blob?.type.startsWith("image/") ? await rasterizeToPng(dataUrl) : null;
  if (!png) {
    throw new ApiError({
      code: "invalid_file",
      status: 422,
      detail: "The signature must be an image.",
    });
  }
  return png;
}
