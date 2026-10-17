// Helpers for the simulated signed documents. In production DocuSeal produces the sealed PDF, the signature images
// and the audit trail; the app only shows them.

/** A typed-style signature as an SVG data URL (used for sample data, where nobody drew anything). */
export function typedSignatureDataUrl(name: string): string {
  const safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="140" viewBox="0 0 440 140"><text x="20" y="82" font-family="Segoe Script, Brush Script MT, Apple Chancery, cursive" font-size="40" fill="#08293d">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
