// Sample data of the configurable entry contracts: who signs for SM Square, the assessment link of each SM person,
// which advisor brought each lead, and Techos Delgado half way through (Acuerdo de Vinculación signed by the three,
// validation closed, Operating Agreement created by its rule with seven days to sign).
import type { Contract, Lead, User } from "../types";
import { typedSignatureDataUrl } from "@/lib/contracts/signature";
import * as seed from "./seed";
import { sealIfSigned } from "./contract-texts";

/** Corporate (Marilyn), the office admin (Andrea) and Camila may sign for SM Square; Nicolás may not. */
export function seedSigningPeople(users: User[]) {
  const allowed = new Set([seed.U_MARYLIN, seed.U_ANDREA, seed.U_CAMILA]);
  for (const u of users) if (u.role === "sm_team" || u.role === "sm_global") u.can_sign_sm_square = allowed.has(u.id);
}

const slugOf = (name: string) =>
  (name.split(" ")[0] ?? name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Every SM person gets the key of the assessment link (first name); two leads came through one. */
export function seedAdvisors(leads: Lead[], users: User[]) {
  const taken = new Set<string>();
  for (const u of users) {
    if (u.role !== "sm_team" && u.role !== "sm_global") continue;
    let slug = slugOf(u.full_name);
    for (let n = 2; taken.has(slug); n += 1) slug = `${slugOf(u.full_name)}${n}`;
    taken.add(slug);
    u.advisor_slug = slug;
  }
  const advisor = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? { id: u.id, name: u.full_name } : null;
  };
  for (const l of leads) {
    if (l.business.name === "Castillo Instalaciones") l.completed_by_advisor = advisor(seed.U_NICOLAS);
    else if (l.business.name === "Techos Delgado") l.completed_by_advisor = advisor(seed.U_CAMILA);
    else if (l.completed_by_advisor === undefined) l.completed_by_advisor = null;
  }
}

/**
 * Techos Delgado: validation closed on Oct 9 (60 / 30 / 10, SM Square Miami, Camila as holder); the binding agreement
 * the engine creates from Jefferson's acceptance is signed by the three on Oct 11, so the engine then creates the
 * Operating Agreement that day, to sign by Oct 18.
 */
export function seedTechosBinding(db: { leads: Lead[]; contracts: Contract[] }, sweep: () => void) {
  const techos = db.leads.find((l) => l.business.name === "Techos Delgado");
  if (!techos?.business_id) return;
  techos.validation = {
    status: "closed", equity_owner: 60, equity_bishop: 30, equity_sm: 10, investment_amount: 150_000,
    notes: "Proyección validada con los estados financieros 2025.", sm_square_center: "SM Square Miami",
    sm_square_holder_user_id: seed.U_CAMILA, closed_at: "2026-10-09T15:00:00.000Z", closed_by: seed.U_ANDREA,
  };
  // The binding agreement only: the Operating Agreement waits for it signed.
  sweep();
  const binding = db.contracts.find((c) => c.business_id === techos.business_id && c.kind === "binding");
  if (!binding) return;
  const sentOn = binding.sent_at ?? "2026-10-09";
  for (const s of binding.signers) {
    s.status = "signed";
    s.signed_at = "2026-10-11";
    s.history = [{ status: "sent", at: sentOn }, { status: "opened", at: "2026-10-11" }, { status: "signed", at: "2026-10-11" }];
    s.signature = { kind: "typed", image_url: typedSignatureDataUrl(s.name) };
  }
  binding.state = "signed";
  binding.signed_at = "2026-10-11";
  sealIfSigned(binding);
  sweep();
}
