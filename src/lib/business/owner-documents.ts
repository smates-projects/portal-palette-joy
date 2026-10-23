// The owner's entry documents as Inicio and Documentos show them (QA M1 and B5 of 23 Oct 2026).
import type { BusinessDocument } from "@/lib/api/network-types";

type Doc = Pick<BusinessDocument, "state" | "required">;

const isOpen = (d: Doc) => d.state === "requested" || d.state === "rejected";

/** What SM asked again comes first (with SM's reason), then what is still to send, then the rest, each in its order. */
export function ownerDocumentsInOrder<T extends Doc>(docs: readonly T[]): T[] {
  return [...docs.filter((d) => d.state === "rejected"), ...docs.filter((d) => d.state === "requested"), ...docs.filter((d) => !isOpen(d))];
}

/** "Te faltan N documentos": only the required ones still to send or asked again (an optional one never blocks). */
export function missingRequiredDocuments(docs: readonly Doc[]): number {
  return docs.filter((d) => isOpen(d) && d.required !== false).length;
}
