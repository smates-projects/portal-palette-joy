// Helpers for the simulated signed documents. In production DocuSeal produces the sealed PDF, the signature images
// and the audit trail; the app only shows them.

/** A typed-style signature as an SVG data URL (used for sample data, where nobody drew anything). */
export function typedSignatureDataUrl(name: string): string {
  const safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="140" viewBox="0 0 440 140"><text x="20" y="82" font-family="Segoe Script, Brush Script MT, Apple Chancery, cursive" font-size="40" fill="#08293d">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type ContractSection = { heading: string | null; text: string };

/** Strategic Mates' documents title each clause "PRIMERA: LAS PARTES Y FINALIDAD.-" ("FIRST: THE PARTIES AND PURPOSE.-"). */
const CLAUSE_HEADING = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]*:\s.*\.-$/;
const isClauseHeading = (line: string) => CLAUSE_HEADING.test(line.trim());
/** A line in capitals only ("MEMORANDO DE ENTENDIMIENTO"): part of the document's title. */
const isTitleLine = (line: string) => line === line.toLocaleUpperCase() && /\p{Lu}/u.test(line);

/** Lines without the blank ones at both ends, joined. */
const joinTrimmed = (lines: string[]) => lines.join("\n").trim();

/**
 * The sections of a contract's full text (Contract.body), for the document dialog. Two shapes:
 * - Clause headings (Strategic Mates' texts, the API's one clause per line with no blank lines): each heading starts
 *   a section that runs until the next heading. The capitals title above the first clause is left out (the dialog
 *   already shows the contract's name); any other text before it is an untitled section. After the last clause, what
 *   follows a blank line (signature blocks, the governing language clause) is an untitled section.
 * - Otherwise blocks separated by a blank line; a block whose first line reads "1. Qué protege" becomes a section with
 *   that heading. The first block is the title, so it is left out.
 */
export function contractSections(body: string): ContractSection[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const starts = lines.flatMap((line, i) => (isClauseHeading(line) ? [i] : []));
  return starts.length > 0 ? clauseSections(lines, starts) : blockSections(body);
}

function clauseSections(lines: string[], starts: number[]): ContractSection[] {
  const sections: ContractSection[] = [];
  const preamble = lines.slice(0, starts[0]).map((l) => l.trim()).filter(Boolean);
  let titleEnd = 0;
  while (titleEnd < preamble.length && isTitleLine(preamble[titleEnd]!)) titleEnd++;
  const intro = preamble.slice(titleEnd).join("\n");
  if (intro) sections.push({ heading: null, text: intro });

  starts.forEach((start, n) => {
    const isLast = n === starts.length - 1;
    const bodyLines = lines.slice(start + 1, isLast ? lines.length : starts[n + 1]);
    let trailer: string[] = [];
    if (isLast) {
      // The last clause ends at the first blank line after its text; the rest is not part of the clause.
      const firstText = bodyLines.findIndex((l) => l.trim() !== "");
      const blank = firstText < 0 ? -1 : bodyLines.findIndex((l, i) => i > firstText && l.trim() === "");
      if (blank >= 0) trailer = bodyLines.splice(blank);
    }
    sections.push({ heading: lines[start]!.trim(), text: joinTrimmed(bodyLines) });
    const rest = joinTrimmed(trailer);
    if (rest) sections.push({ heading: null, text: rest });
  });
  return sections;
}

function blockSections(body: string): ContractSection[] {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.slice(1).map((block) => {
    const [first = "", ...rest] = block.split("\n");
    // "1. Objeto. …\n2. Información …" is a numbered list of clauses (siblings), not a heading with its text.
    const list = rest.some((line) => /^\d+\.\s/.test(line.trim()));
    return /^\d+\.\s/.test(first) && !list && rest.length > 0 ? { heading: first, text: rest.join("\n") } : { heading: null, text: block };
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
  signature: { kind: "drawn" | "typed" | "uploaded" | "saved"; image_url: string } | null | undefined,
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
