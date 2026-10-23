import { describe, expect, it } from "vitest";
import { missingRequiredDocuments, ownerDocumentsInOrder } from "./owner-documents";

const doc = (id: string, state: "requested" | "received" | "reviewed" | "rejected" | "not_applicable", required?: boolean) => ({ id, state, required });

describe("owner documents (QA M1, B5)", () => {
  it("what SM asked again comes first, then what is still to send, then the rest, keeping their order", () => {
    const docs = [doc("a", "reviewed"), doc("b", "requested"), doc("c", "rejected"), doc("d", "received"), doc("e", "requested"), doc("f", "rejected")];
    expect(ownerDocumentsInOrder(docs).map((d) => d.id)).toEqual(["c", "f", "b", "e", "a", "d"]);
  });

  it("'Te faltan N documentos' counts only the required ones still to send or asked again", () => {
    const docs = [doc("a", "requested"), doc("b", "rejected"), doc("c", "requested", false), doc("d", "received"), doc("e", "requested", true)];
    expect(missingRequiredDocuments(docs)).toBe(3);
    expect(missingRequiredDocuments([doc("x", "requested", false)])).toBe(0);
  });
});
