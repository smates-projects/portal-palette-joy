// Helpers for the simulated signed documents. In production DocuSeal produces the sealed PDF, the signature images
// and the audit trail; the app only shows them.

/** A typed-style signature as an SVG data URL (used for sample data, where nobody drew anything). */
export function typedSignatureDataUrl(name: string): string {
  const safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="140" viewBox="0 0 440 140"><text x="20" y="82" font-family="Segoe Script, Brush Script MT, Apple Chancery, cursive" font-size="40" fill="#08293d">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The sections of a contract's full text (Contract.body), for the document dialog. Blocks are separated by a blank
 * line; a block whose first line reads "1. Qué protege" becomes a section with that heading. The first block is the
 * title of the text (the dialog already shows the contract's name), so it is left out.
 */
export function contractSections(body: string): { heading: string | null; text: string }[] {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.slice(1).map((block) => {
    const [first = "", ...rest] = block.split("\n");
    // "1. Objeto. …\n2. Información …" is a numbered list of clauses (siblings), not a heading with its text.
    const list = rest.some((line) => /^\d+\.\s/.test(line.trim()));
    // Strategic Mates' documents title each clause "PRIMERA: LAS PARTES Y FINALIDAD.-".
    const clause = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]*:\s.*\.-$/.test(first.trim());
    return (clause || (/^\d+\.\s/.test(first) && !list)) && rest.length > 0 ? { heading: first, text: rest.join("\n") } : { heading: null, text: block };
  });
}

/** How a signer's signature is drawn: the name in the script style, or an image. */
export type SignatureView = { kind: "text"; text: string } | { kind: "image"; src: string };

/**
 * A signature as shown in a document. A data URL (the pad, the mock) is an image as is. A typed signature stored by
 * the API is the name in the script style (its stored file is only a rendering of the same name). A stored drawn or
 * uploaded one is an image: the API answers its link relative to its own origin ("/api/v1/files/{id}/download"), so it
 * is resolved against the API base URL, not the front. Without any image, the name in the script style.
 */
export function signatureView(
  signature: { kind: "drawn" | "typed" | "uploaded"; image_url: string } | null | undefined,
  signerName: string,
  apiBaseUrl: string,
): SignatureView {
  const url = signature?.image_url?.trim() ?? "";
  if (url.startsWith("data:")) return { kind: "image", src: url };
  if (!signature || !url || signature.kind === "typed") return { kind: "text", text: signerName };
  if (/^https?:\/\//i.test(url)) return { kind: "image", src: url };
  try {
    return { kind: "image", src: new URL(url, apiBaseUrl).toString() };
  } catch {
    return { kind: "text", text: signerName };
  }
}

/** Stable fake SHA-256 of a document, so the demo shows the same fingerprint every time. */
export function documentFingerprint(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const ch of seed) {
    h1 = Math.imul(h1 ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + ch.charCodeAt(0), 0x9e3779b1) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2c1b3c6d) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x297a2d39) >>> 0;
    out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}
