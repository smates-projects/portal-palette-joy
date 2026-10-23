// Configurable entry contracts in the mock: the rules SM Global edits, the engine that creates each business's
// contracts from them, the validation with the definitive percentages and who signs for Strategic Mates.
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
type Api = Awaited<ReturnType<typeof as>>;
const leadNamed = async (api: Api, name: string) => (await api.leads.list()).find((l) => l.business.name === name)!;
const contractsOf = async (api: Api, leadId: string) => (await api.leads.getIntake(leadId))!.contracts;
const valid = { equity_owner: 60, equity_bishop: 30, equity_sm: 10, investment_amount: 150000, notes: "Proyección validada", sm_square_center: "SM Square Miami", sm_square_holder_user_id: seed.U_CAMILA };

/** Laura takes Brisa Clean Services: the engine creates the binding agreement. Ends as Camila. */
async function bishopTakesBrisa(api: Api) {
  const brisa = await leadNamed(api, "Brisa Clean Services");
  await api.session.setViewAs(net.U_LAURA);
  await api.bishop.acceptOpportunity(brisa.id);
  await api.session.setViewAs(seed.U_CAMILA);
  const owner = (await api.users.list()).find((u) => u.role === "business_owner" && u.business_id === brisa.business_id)!;
  return { brisa, owner };
}

describe("the rule engine in the demo", () => {
  it("the Bishop's acceptance creates the Acuerdo de Vinculación for the three, Corporate signing for Strategic Mates", async () => {
    const api = await as(seed.U_CAMILA);
    const { brisa, owner } = await bishopTakesBrisa(api);
    const binding = (await contractsOf(api, brisa.id)).find((c) => c.kind === "binding")!;
    expect(binding).toMatchObject({ name: "Acuerdo de Vinculación y Formalización", rule_code: "binding", state: "sent", sent_at: "2026-10-14" });
    expect(binding.signers.map((s) => `${s.party}:${s.name}`)).toEqual([`owner:${owner.full_name}`, "bishop:Laura Ortega", "sm:Marilyn Boraei"]);
    expect(binding.signers.find((s) => s.party === "sm")).toMatchObject({ sm_entity: "corporate", user_id: seed.U_MARYLIN });
    expect(binding.body).toContain("Brisa Clean Services");
    expect(binding.body).toContain("Laura Ortega");
    // Bilingual: the English text and window with the same values, both ending with the governing language clause.
    expect(binding.text?.es).toBe(binding.body);
    expect(binding.text?.en).toContain("BINDING AND FORMALIZATION AGREEMENT");
    expect(binding.text?.en).toContain("Brisa Clean Services");
    expect(binding.text?.en).toMatch(/the English version prevails\.$/);
    expect(binding.body).toMatch(/prevalece la versión en inglés\.$/);
    expect(binding.explainers?.en?.title).toBe("What the Binding Agreement is");
    expect(binding.explainers?.es).toEqual(binding.explainer);
    expect(binding.language_governing).toBe("en");
    // Only once: reading again creates nothing new.
    await api.leads.list();
    expect((await contractsOf(api, brisa.id)).filter((c) => c.kind === "binding")).toHaveLength(1);
    // The owner, the office and Corporate hear about it.
    for (const id of [owner.id, seed.U_MARYLIN, seed.U_CAMILA]) {
      await api.session.setViewAs(id);
      expect((await api.notifications.list()).some((n) => n.kind === "binding_ready"), id).toBe(true);
    }
  });

  it("only Corporate's signer signs the binding agreement for SM; signed by the three, the OA waits for the validation", async () => {
    const api = await as(seed.U_CAMILA);
    const { brisa, owner } = await bishopTakesBrisa(api);
    const binding = (await contractsOf(api, brisa.id)).find((c) => c.kind === "binding")!;
    await expect(api.documents.signContract(binding.id)).rejects.toThrow("not_signer");
    for (const id of [owner.id, net.U_LAURA, seed.U_MARYLIN]) {
      await api.session.setViewAs(id);
      await api.documents.signContract(binding.id);
    }
    await api.session.setViewAs(seed.U_CAMILA);
    const signed = (await contractsOf(api, brisa.id)).find((c) => c.kind === "binding")!;
    expect(signed.state).toBe("signed");
    // The last signature seals the two copies (fake ids and links in the demo).
    expect(signed.sealed_files?.es?.download_url).toMatch(/\/es\.pdf\?/);
    expect(signed.sealed_files?.en?.download_url).toMatch(/\/en\.pdf\?/);
    expect(signed.sealed_files?.es?.file_id).not.toBe(signed.sealed_files?.en?.file_id);
    expect((await contractsOf(api, brisa.id)).some((c) => c.kind === "tripartite")).toBe(false);
    await expect(api.leads.sendTripartite(brisa.id)).rejects.toThrow("validation_open");
  });

  it("the validation: ranges and 100 %, no holder (Global signs for SM Square), closed by an admin; then the OA with 7 days", async () => {
    const api = await as(seed.U_CAMILA);
    const { brisa, owner } = await bishopTakesBrisa(api);
    const binding = (await contractsOf(api, brisa.id)).find((c) => c.kind === "binding")!;
    for (const id of [owner.id, net.U_LAURA, seed.U_MARYLIN]) {
      await api.session.setViewAs(id);
      await api.documents.signContract(binding.id);
    }
    await api.session.setViewAs(seed.U_CAMILA);
    await expect(api.leads.saveValidation(brisa.id, { ...valid, equity_owner: 70 })).rejects.toThrow("invalid_split");
    await expect(api.leads.saveValidation(brisa.id, { ...valid, equity_bishop: 45, equity_owner: 45 })).rejects.toThrow("invalid_split");
    // Global signs for SM Square (the default): a holder sent is ignored, as the API does.
    expect((await api.leads.saveValidation(brisa.id, { ...valid, sm_square_holder_user_id: seed.U_NICOLAS })).validation?.sm_square_holder_user_id).toBeNull();
    // A draft may leave fields empty.
    expect((await api.leads.saveValidation(brisa.id, { ...valid, equity_bishop: null })).validation).toMatchObject({ status: "open", equity_bishop: null });
    await expect(api.leads.closeValidation(brisa.id)).rejects.toThrow("admin_only");
    await api.session.setViewAs(seed.U_ANDREA);
    await expect(api.leads.closeValidation(brisa.id)).rejects.toThrow("invalid_split");
    await api.leads.saveValidation(brisa.id, valid);
    const closed = await api.leads.closeValidation(brisa.id);
    expect(closed.validation).toMatchObject({ status: "closed", closed_by: seed.U_ANDREA, equity_owner: 60, equity_bishop: 30, equity_sm: 10 });
    await expect(api.leads.saveValidation(brisa.id, valid)).rejects.toThrow("invalid_state");
    // The binding agreement was signed today: the Operating Agreement is created now, to sign by Oct 21.
    const oa = (await contractsOf(api, brisa.id)).find((c) => c.kind === "tripartite")!;
    expect(oa).toMatchObject({ rule_code: "operating_agreement", sent_at: "2026-10-14", sign_by: "2026-10-21" });
    expect(oa.signers.find((s) => s.party === "sm")).toMatchObject({ sm_entity: "sm_square", user_id: seed.U_MARYLIN, name: "Marilyn Boraei" });
    expect(oa.body).toContain("Small Business, 60 %; Business Bishop, 30 %; SM Square, 10 %");
    expect(oa.body).toContain("SM Square Miami");
    // Nicolás and Camila cannot sign for SM Square; Marilyn, Global's signer, can.
    for (const id of [seed.U_NICOLAS, seed.U_CAMILA]) {
      await api.session.setViewAs(id);
      await expect(api.documents.signContract(oa.id)).rejects.toThrow("sm_square_signer_required");
    }
    await api.session.setViewAs(seed.U_MARYLIN);
    expect((await api.documents.signContract(oa.id)).signers.find((s) => s.party === "sm")!.status).toBe("signed");
    // The Bishop sees the definitive split; the owner reads it in "Tu ingreso" and in the bell.
    await api.session.setViewAs(net.U_LAURA);
    expect((await api.bishop.getOpportunity(brisa.id))!).toMatchObject({ split_final: true, share_year1_pct: 30, share_stable_pct: 30 });
    await api.session.setViewAs(owner.id);
    expect((await api.documents.getIntake())!.entry!.validation).toMatchObject({ status: "closed", equity_owner: 60 });
    expect((await api.notifications.list()).map((n) => n.kind)).toEqual(expect.arrayContaining(["binding_ready", "validation_closed"]));
  });

  it("the governing language in Reglas applies to the contracts sent afterwards", async () => {
    const api = await as(seed.U_MARYLIN);
    await expect(api.rules.update({ contracts: { governing_language: "fr" as "es" } })).rejects.toThrow("invalid_governing_language");
    await api.rules.update({ contracts: { governing_language: "es" } }, "Prevalece el español");
    expect((await api.rules.listHistory())[0]).toMatchObject({ changes: [{ field: "contracts", to: { governing_language: "es" } }] });
    const { brisa } = await bishopTakesBrisa(api);
    const binding = (await contractsOf(api, brisa.id)).find((c) => c.kind === "binding")!;
    expect(binding.language_governing).toBe("es");
    expect(binding.text?.es).toMatch(/prevalece la versión en español\.$/);
    expect(binding.text?.en).toMatch(/the Spanish version prevails\.$/);
  });

  it("the provisional split stays for an open validation", async () => {
    const api = await as(net.U_JEFFERSON);
    const sol = (await api.bishop.listOpportunities()).find((o) => o.business_name === "Sol Remodeling")!;
    expect(sol).toMatchObject({ split_final: false, share_year1_pct: 50, share_stable_pct: 22 });
    expect((await api.bishop.listOpportunities()).find((o) => o.business_name === "Techos Delgado")).toMatchObject({ split_final: true, share_year1_pct: 30 });
  });
});

describe("rules repository (SM Global edits, SM reads)", () => {
  it("lists the four default rules in order; only SM Global writes", async () => {
    const api = await as(seed.U_NICOLAS);
    expect((await api.contractRules.list()).map((r) => r.code)).toEqual(["nda", "mou", "binding", "operating_agreement"]);
    await expect(api.contractRules.archive("mou")).rejects.toThrow("forbidden");
    await api.session.setViewAs(net.U_JEFFERSON);
    await expect(api.contractRules.list()).rejects.toThrow("forbidden");
  });

  it("edits with the version (stale: precondition_failed), keeps the history, archives and restores", async () => {
    const api = await as(seed.U_MARYLIN);
    const oa = (await api.contractRules.list()).find((r) => r.code === "operating_agreement")!;
    await expect(api.contractRules.update(oa.code, { deadline_days: 10 }, oa.version + 1)).rejects.toThrow("precondition_failed");
    const edited = await api.contractRules.update(oa.code, { deadline_days: 10 }, oa.version, "Diez días");
    expect(edited).toMatchObject({ deadline_days: 10, version: oa.version + 1 });
    expect((await api.contractRules.listHistory())[0]).toMatchObject({ code: "operating_agreement", kind: "edited", changes: [{ field: "deadline_days", from: 7, to: 10 }], note: "Diez días" });
    await expect(api.contractRules.update("binding", { trigger: "contract_signed:binding" }, 1)).rejects.toThrow("invalid_trigger");
    // The Operating Agreement waits for the binding agreement: the binding rule cannot be archived.
    await expect(api.contractRules.archive("binding")).rejects.toThrow("rule_in_use");
    expect(await api.contractRules.archive("operating_agreement", "Lo hacemos por fuera")).toMatchObject({ active: false });
    expect(await api.contractRules.archive("binding")).toMatchObject({ active: false });
    expect(await api.contractRules.restore("binding")).toMatchObject({ active: true });
    expect((await api.contractRules.listHistory()).map((h) => h.kind).slice(0, 3)).toEqual(["restored", "archived", "archived"]);
  });

  it("a new rule creates its contract for every business whose trigger already happened", async () => {
    const api = await as(seed.U_MARYLIN);
    const added = await api.contractRules.add({
      name: "Anexo de marca", kind: "other", template: "Anexo de {{business_name}}", explainer: { title: "Qué es el anexo", paragraphs: [], bullets: [] },
      signers: [{ party: "owner" }, { party: "sm", sm_entity: "corporate", auto_sign: true }], trigger: "documents_approved",
      delay_days: 0, deadline_days: 5, blocks: [], required: false, position: 5,
    });
    expect(added).toMatchObject({ code: "anexo_de_marca", active: true, version: 1 });
    await api.session.setViewAs(seed.U_CAMILA);
    const brisa = await leadNamed(api, "Brisa Clean Services");
    const annex = (await contractsOf(api, brisa.id)).find((c) => c.rule_code === "anexo_de_marca")!;
    expect(annex).toMatchObject({ kind: "other" });
    expect(annex.body).toMatch(/^Anexo de Brisa Clean Services\n\n/);
    // A text Corporate wrote has no English version yet: the readers show the Spanish one.
    expect(annex.text).toMatchObject({ en: null });
    expect(annex.explainers).toMatchObject({ en: null });
    expect(annex.signers.find((s) => s.party === "sm")!.status).toBe("signed");
    // Signed by SM only: no sealed copy until the owner signs too.
    expect(annex.sealed_files ?? null).toBeNull();
  });
});

describe("people who sign for Strategic Mates and the advisor link", () => {
  it("SM Global grants 'Puede firmar por SM Square' to SM people only", async () => {
    const api = await as(seed.U_MARYLIN);
    const users = await api.users.list();
    expect(users.find((u) => u.id === seed.U_NICOLAS)).toMatchObject({ can_sign_sm_square: false, advisor_slug: "nicolas" });
    expect(users.find((u) => u.id === seed.U_CAMILA)).toMatchObject({ can_sign_sm_square: true, advisor_slug: "camila" });
    expect(await api.users.setSigningEntities(seed.U_NICOLAS, { can_sign_sm_square: true })).toMatchObject({ can_sign_sm_square: true });
    await expect(api.users.setSigningEntities(seed.U_CARLA, { can_sign_sm_square: true })).rejects.toThrow("invalid_user");
    await api.session.setViewAs(seed.U_ANDREA);
    await expect(api.users.setSigningEntities(seed.U_NICOLAS, { can_sign_sm_square: false })).rejects.toThrow("forbidden");
  });

  it("a lead says which advisor's link the owner used", async () => {
    const api = await as(seed.U_NICOLAS);
    expect((await leadNamed(api, "Castillo Instalaciones")).completed_by_advisor).toEqual({ id: seed.U_NICOLAS, name: "Nicolás García" });
    expect((await leadNamed(api, "Brisa Clean Services")).completed_by_advisor).toBeNull();
  });
});
