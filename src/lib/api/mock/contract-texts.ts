// Texts of the entry contracts in the mock: the plain-words window above the signer (explainer) and the full text
// the document dialog shows (body). They come from the default entry contract rules, which carry Strategic Mates'
// own documents (lib/leads/contract-templates); the real API sends its own in the same shape.
import { defaultRule, fillContractTemplate, type ContractTemplatePlaceholder } from "@/lib/leads/contract-rules";
import type { ContractExplainer } from "../types";

const explainerOf = (code: string): ContractExplainer => structuredClone(defaultRule(code)!.explainer);

/** Strategic Mates' NDA: already signed by Strategic Mates, the owner signs. */
export const NDA_EXPLAINER: ContractExplainer = explainerOf("nda");

type Values = Partial<Record<ContractTemplatePlaceholder, string | number | null | undefined>>;

export const ndaBody = (businessName: string, ownerName: string, values: Values = {}) =>
  fillContractTemplate(defaultRule("nda")!.template, { business_name: businessName, owner_name: ownerName, ...values });

/** The MOU: the four points in plain words come after this window, each one with its own "Entendí". */
export const MOU_EXPLAINER: ContractExplainer = explainerOf("mou");

export const mouBody = (businessName: string, ownerName: string, values: Values = {}) =>
  fillContractTemplate(defaultRule("mou")!.template, { business_name: businessName, owner_name: ownerName, ...values });

/** The owner's own NDA: he wrote it in the portal, Strategic Mates signs it. */
export const OWNER_NDA_EXPLAINER: ContractExplainer = {
  title: "Tu acuerdo de confidencialidad",
  paragraphs: [
    "Es el acuerdo que escribió el dueño para proteger la información de su negocio. Strategic Mates lo firma; el dueño puede firmarlo también.",
  ],
  bullets: [
    "No reemplaza al NDA de Strategic Mates: se suman.",
    "El texto es el que escribió el dueño.",
  ],
};
