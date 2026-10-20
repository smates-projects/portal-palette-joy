import { describe, expect, it } from "vitest";
import { contractSections } from "./signature";
import { mouBody } from "../api/mock/contract-texts";

describe("contract sections (the document dialog)", () => {
  it("leaves the title out, makes '1. ...' blocks sections with a heading and keeps the rest as text", () => {
    expect(contractSections("Acuerdo\n\nEntre A y B.\n\n1. Qué protege\nTodo.\nY más.\n\n2. Sin texto")).toEqual([
      { heading: null, text: "Entre A y B." },
      { heading: "1. Qué protege", text: "Todo.\nY más." },
      { heading: null, text: "2. Sin texto" },
    ]);
  });

  it("the sample MOU reads as eight numbered sections after its parties", () => {
    const sections = contractSections(mouBody("Vossler", "Carla Méndez"));
    expect(sections[0]).toEqual({ heading: null, text: "Entre Strategic Mates y Vossler, representado por Carla Méndez." });
    expect(sections.filter((s) => s.heading)).toHaveLength(8);
  });
});
