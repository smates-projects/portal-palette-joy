import { describe, expect, it } from "vitest";
import { contractSections, signatureView } from "./signature";
import { mouBody } from "../api/mock/contract-texts";

describe("contract sections (the document dialog)", () => {
  it("leaves the title out, makes '1. ...' blocks sections with a heading and keeps the rest as text", () => {
    expect(contractSections("Acuerdo\n\nEntre A y B.\n\n1. Qué protege\nTodo.\nY más.\n\n2. Sin texto")).toEqual([
      { heading: null, text: "Entre A y B." },
      { heading: "1. Qué protege", text: "Todo.\nY más." },
      { heading: null, text: "2. Sin texto" },
    ]);
  });

  it("a block of numbered clauses (the API's NDA) stays one list, never a bold first clause; sub-points keep the heading", () => {
    expect(contractSections("NDA\n\nPartes.\n\n1. Objeto. Compartir.\n2. Uso. Solo evaluar.")).toEqual([
      { heading: null, text: "Partes." },
      { heading: null, text: "1. Objeto. Compartir.\n2. Uso. Solo evaluar." },
    ]);
    expect(contractSections("MOU\n\n1. Los fondos.\n1.1. Pagan el trabajo.\n1.2. No van al dueño.")).toEqual([
      { heading: "1. Los fondos.", text: "1.1. Pagan el trabajo.\n1.2. No van al dueño." },
    ]);
  });

  it("Strategic Mates' MOU reads as its ten clauses (PRIMERA to DÉCIMA), the business filled in", () => {
    const sections = contractSections(mouBody("Vossler", "Carla Méndez"));
    expect(sections[0]?.heading).toBe("PRIMERA: COMPARECIENTES.-");
    expect(sections[0]?.text).toContain("Vossler, domiciliada en");
    expect(sections.filter((s) => s.heading)).toHaveLength(10);
  });

  it("the API's text, one clause per line with no blank lines, keeps every clause (es)", () => {
    const body = [
      "MEMORANDO DE ENTENDIMIENTO",
      "SMALL BUSINESS",
      "PRIMERA: COMPARECIENTES.-",
      "Comparecen LA EMPRESA y EL SMALL BUSINESS.",
      "SEGUNDA: ANTECEDENTES Y OBJETO.-",
      "El negocio hace remodelaciones.",
      "Small Business: del 50 % al 75 %.",
      "DÉCIMA PRIMERA: DISPOSICIONES GENERALES Y FIRMA.-",
      "En constancia, LAS PARTES firman.",
      "",
      "POR LA EMPRESA",
      "Marilyn Boraei",
      "",
      "Este documento se firma en español y en inglés.",
    ].join("\n");
    expect(contractSections(body)).toEqual([
      { heading: "PRIMERA: COMPARECIENTES.-", text: "Comparecen LA EMPRESA y EL SMALL BUSINESS." },
      { heading: "SEGUNDA: ANTECEDENTES Y OBJETO.-", text: "El negocio hace remodelaciones.\nSmall Business: del 50 % al 75 %." },
      { heading: "DÉCIMA PRIMERA: DISPOSICIONES GENERALES Y FIRMA.-", text: "En constancia, LAS PARTES firman." },
      { heading: null, text: "POR LA EMPRESA\nMarilyn Boraei\n\nEste documento se firma en español y en inglés." },
    ]);
  });

  it("the API's text, one clause per line with no blank lines, keeps every clause (en)", () => {
    const body = [
      "SMALL BUSINESS CONFIDENTIALITY AGREEMENT",
      "FIRST: THE PARTIES AND PURPOSE.-",
      "STRATEGIC MATES LLC and the business sign this agreement.",
      "The information is exchanged to evaluate the business.",
      "SECOND: CONFIDENTIAL INFORMATION AND EXCLUSIONS.-",
      "Confidential Information is any non-public information.",
      "ELEVENTH: GENERAL PROVISIONS AND SIGNATURE.-",
      "THE PARTIES sign this agreement.",
    ].join("\n");
    const sections = contractSections(body);
    expect(sections.map((s) => s.heading)).toEqual([
      "FIRST: THE PARTIES AND PURPOSE.-",
      "SECOND: CONFIDENTIAL INFORMATION AND EXCLUSIONS.-",
      "ELEVENTH: GENERAL PROVISIONS AND SIGNATURE.-",
    ]);
    expect(sections[0]?.text).toBe("STRATEGIC MATES LLC and the business sign this agreement.\nThe information is exchanged to evaluate the business.");
    expect(sections[2]?.text).toBe("THE PARTIES sign this agreement.");
  });

  it("text before the first clause that is not the title stays, as an untitled section", () => {
    expect(contractSections("ACUERDO\nEntre A y B.\nPRIMERA: OBJETO.-\nTodo.")).toEqual([
      { heading: null, text: "Entre A y B." },
      { heading: "PRIMERA: OBJETO.-", text: "Todo." },
    ]);
  });
});

describe("signature view (the signature blocks of a contract)", () => {
  const API = "http://localhost:3100/api/v1";
  it("a typed signature stored by the API is the name in the script style, never a broken image", () => {
    expect(signatureView({ kind: "typed", image_url: "/api/v1/files/f1/download" }, "Nicolás García", API)).toEqual({ kind: "text", text: "Nicolás García" });
    expect(signatureView({ kind: "typed", image_url: "" }, "Nicolás García", API)).toEqual({ kind: "text", text: "Nicolás García" });
    expect(signatureView(null, "Rosa Benítez", API)).toEqual({ kind: "text", text: "Rosa Benítez" });
  });
  it("a drawn or uploaded file is an image resolved against the API origin, not the front", () => {
    expect(signatureView({ kind: "drawn", image_url: "/api/v1/files/f1/download" }, "Rosa", API)).toEqual({ kind: "image", src: "http://localhost:3100/api/v1/files/f1/download" });
    expect(signatureView({ kind: "uploaded", image_url: "https://cdn.example.com/s.png" }, "Rosa", API)).toEqual({ kind: "image", src: "https://cdn.example.com/s.png" });
  });
  it("a data URL (the pad, the mock) is an image as is, even when typed", () => {
    expect(signatureView({ kind: "typed", image_url: "data:image/svg+xml,x" }, "Rosa", API)).toEqual({ kind: "image", src: "data:image/svg+xml,x" });
  });
});
