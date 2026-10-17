// Entry flow in the mock: NDA + MOU, due diligence documents, review clock and approval.
// The real backend gets the DocuSeal events by webhook; here signing is simulated through the same repository calls.
import { TODAY } from "@/config/app";
import { summarizeIntake, isDocsAdmin, canResend } from "@/lib/leads/onboarding";
import { typedSignatureDataUrl } from "@/lib/contracts/signature";
import type { Business, BusinessDocument, Contract, IntakeSummary, Lead, Signer, SignerStatus, User, Uuid } from "../types";
import type { PlatformRules } from "../network-types";

export interface IntakeRecord {
  lead_id: Uuid;
  business_id: Uuid;
  /** Day the owner completed the upload of every required document. */
  review_started_at: string | null;
  approved_at: string | null;
  approved_by: Uuid | null;
}

export interface IntakeDb {
  leads: Lead[];
  users: User[];
  businesses: Business[];
  documents: BusinessDocument[];
  contracts: Contract[];
  rules: PlatformRules;
  intakes: IntakeRecord[];
}

const addDays = (d: string, n: number) => {
  const x = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const sid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const signer = (party: "owner" | "sm", name: string, user_id: Uuid | null, sentOn: string, steps: SignerStatus[] = []): Signer => {
  const history: { status: SignerStatus; at: string }[] = [{ status: "sent", at: sentOn }];
  steps.forEach((s, i) => history.push({ status: s, at: addDays(sentOn, i + 1) }));
  const last = history.at(-1)!;
  return {
    name, role: party, party, user_id, status: last.status, history,
    signed_at: last.status === "signed" ? last.at : null, decline_reason: null,
    signature: last.status === "signed" ? { kind: "typed", image_url: typedSignatureDataUrl(name) } : null,
  };
};

const contractState = (c: Contract): Contract["state"] =>
  c.signers.some((s) => s.status === "declined") ? "declined"
    : c.signers.every((s) => s.status === "signed") ? "signed"
      : c.signers.some((s) => s.status === "opened" || s.status === "signed") ? "opened" : "sent";

export function createIntake(db: IntakeDb, newId: () => string) {
  const record = (leadId: Uuid) => db.intakes.find((i) => i.lead_id === leadId);
  const docsOf = (businessId: Uuid) => db.documents.filter((d) => d.business_id === businessId && d.area === "intake");
  const contractsOf = (businessId: Uuid) => db.contracts.filter((c) => c.business_id === businessId && c.area === "intake");

  const summaryForBusiness = (businessId: Uuid): IntakeSummary | null => {
    const r = db.intakes.find((i) => i.business_id === businessId);
    if (!r) return null;
    return summarizeIntake({
      business_id: businessId, contracts: contractsOf(businessId), docs: docsOf(businessId),
      started_at: r.review_started_at, approved_at: r.approved_at, review_days: db.rules.document_review_days,
    });
  };
  const summaryFor = (lead: Lead): IntakeSummary | null => (lead.business_id && record(lead.id) ? summaryForBusiness(lead.business_id) : null);

  const makeContracts = (businessId: Uuid, ownerName: string, ownerId: Uuid, sentOn: string, ownerSteps: SignerStatus[], smSteps: SignerStatus[]) =>
    (["nda", "mou"] as const).map((kind): Contract => {
      const c: Contract = {
        id: newId(), business_id: businessId, area: "intake", kind, name: kind === "nda" ? "NDA mutuo" : "MOU",
        state: "sent", sent_at: sentOn, signed_at: null,
        signers: [signer("owner", ownerName, ownerId, sentOn, ownerSteps), signer("sm", "Strategic Mates", null, sentOn, smSteps)],
      };
      c.state = contractState(c);
      c.signed_at = c.state === "signed" ? c.signers.map((s) => s.signed_at ?? "").sort().at(-1) ?? null : null;
      return c;
    });

  const makeDocs = (businessId: Uuid, requestedOn: string): BusinessDocument[] =>
    db.rules.intake_documents.filter((r) => !r.archived).map((r) => ({
      id: newId(), business_id: businessId, area: "intake", name: r.name, state: "requested", requested_at: requestedOn,
      received_at: null, file_name: null, required: r.required, rule_id: r.id, only_if_llc: r.only_if_llc, verified_hint: r.verified_hint,
      verified_fact: null, review_comment: null, reviewed_at: null, pauses: [],
    }));

  /** Owner account (simulated invite) + business in onboarding + NDA/MOU + requested documents. */
  const open = (lead: Lead, opts: { sentOn: string; ownerId?: Uuid; businessId?: Uuid; ownerSteps?: SignerStatus[]; smSteps?: SignerStatus[] }) => {
    const ownerId = opts.ownerId ?? newId();
    const businessId = opts.businessId ?? newId();
    db.users.push({
      id: ownerId, full_name: lead.contact.name, email: lead.contact.email, role: "business_owner", organization_id: null,
      business_id: businessId, title: null, google_calendar_email: null, booking_url: null,
    });
    db.businesses.push({
      id: businessId, name: lead.business.name, industry: lead.business.activity, city: lead.contact.city, state: lead.contact.state,
      owner_user_id: ownerId, status: "onboarding", program_start_date: opts.sentOn, program_day: 0, office_id: lead.office_id,
      consultant_id: lead.consultant_user_id,
    });
    lead.business_id = businessId;
    db.contracts.push(...makeContracts(businessId, lead.contact.name, ownerId, opts.sentOn, opts.ownerSteps ?? [], opts.smSteps ?? []));
    db.documents.push(...makeDocs(businessId, opts.sentOn));
    const r: IntakeRecord = { lead_id: lead.id, business_id: businessId, review_started_at: null, approved_at: null, approved_by: null };
    db.intakes.push(r);
    return r;
  };

  const startClockIfComplete = (r: IntakeRecord, today: string) => {
    if (r.review_started_at) return;
    if (docsOf(r.business_id).filter((d) => d.required).every((d) => d.state !== "requested")) r.review_started_at = today;
  };

  /** Sample entry data for leads already in Documentación or Aceptado. Same ids every run. */
  const seed = () => {
    let n = 0;
    for (const lead of db.leads) {
      if (lead.business_id || (lead.stage !== "documents" && lead.stage !== "accepted")) continue;
      n++;
      const docsOn = lead.stage_entered_at.slice(0, 10);
      const accepted = lead.stage === "accepted";
      const ndaOn = accepted ? addDays(docsOn, -10) : addDays(docsOn, 0);
      const r = open(lead, {
        sentOn: ndaOn, ownerId: sid("0d100000", n), businessId: sid("0b100000", n),
        ownerSteps: ["opened", "signed"], smSteps: ["signed"],
      });
      const docs = docsOf(r.business_id);
      const signedOn = addDays(ndaOn, 2);
      const upload = (d: BusinessDocument, on: string) => Object.assign(d, { state: "received", received_at: on, file_name: `${d.name.split(" (")[0]}.pdf` });
      const accept = (d: BusinessDocument, on: string) => Object.assign(d, { state: "reviewed", reviewed_at: on, verified_fact: d.verified_hint ?? null });
      if (lead.business.name === "Sazón Criollo") {
        // 5 of 7 uploaded, 3 accepted, 1 asked again (clock paused), 2 still missing.
        docs.forEach((d, i) => {
          if (i <= 2) { upload(d, addDays(signedOn, 1)); accept(d, addDays(signedOn, 2)); }
          if (i === 3) upload(d, addDays(signedOn, 2));
          if (i === 6) {
            upload(d, addDays(signedOn, 1));
            Object.assign(d, { state: "rejected", reviewed_at: addDays(signedOn, 2), review_comment: "La póliza venció en agosto. Sube la póliza renovada, por favor.", pauses: [{ from: addDays(signedOn, 2), to: null }] });
          }
        });
      } else if (lead.business.name === "Glow Nails & Spa") {
        // Everything uploaded on Sep 27: review day 17 of 15 on Oct 14.
        docs.forEach((d, i) => { upload(d, "2026-09-27"); if (i <= 3) accept(d, "2026-10-01"); });
        r.review_started_at = "2026-09-27";
      } else {
        docs.forEach((d) => { upload(d, addDays(signedOn, 2)); if (accepted) accept(d, addDays(signedOn, 6)); });
        r.review_started_at = addDays(signedOn, 2);
        if (accepted) { r.approved_at = `${docsOn}T15:00:00Z`; r.approved_by = null; }
      }
    }
  };

  // ---------- Actions (authorization is checked by the caller in the mock index) ----------
  const findDoc = (businessId: Uuid, docId: Uuid) => {
    const d = docsOf(businessId).find((x) => x.id === docId);
    if (!d) throw new Error("not_found");
    return d;
  };

  return {
    seed,
    open,
    record,
    summaryFor,
    summaryForBusiness,
    docsOf,
    contractsOf,
    acceptDocument: (r: IntakeRecord, docId: Uuid, fact: string) => {
      const d = findDoc(r.business_id, docId);
      if (d.state !== "received") throw new Error("invalid_state");
      if (!fact.trim()) throw new Error("fact_required");
      Object.assign(d, { state: "reviewed", reviewed_at: TODAY, verified_fact: fact.trim(), review_comment: null });
      return d;
    },
    requestAgain: (r: IntakeRecord, docId: Uuid, comment: string) => {
      const d = findDoc(r.business_id, docId);
      if (d.state !== "received" && d.state !== "reviewed") throw new Error("invalid_state");
      if (!comment.trim()) throw new Error("comment_required");
      Object.assign(d, { state: "rejected", reviewed_at: TODAY, review_comment: comment.trim(), verified_fact: null, pauses: [...(d.pauses ?? []), { from: TODAY, to: null }] });
      return d;
    },
    /** Owner upload of an entry document: needs the NDA signed by the owner. Closes the pause of a replacement. */
    upload: (businessId: Uuid, d: BusinessDocument, fileName: string) => {
      const s = summaryForBusiness(businessId);
      if (s && !s.nda_signed_by_owner) throw new Error("nda_required");
      if (d.state !== "requested" && d.state !== "rejected") throw new Error("invalid_state");
      for (const p of d.pauses ?? []) if (!p.to) p.to = TODAY;
      Object.assign(d, { state: "received", received_at: TODAY, file_name: fileName });
      const r = db.intakes.find((i) => i.business_id === businessId);
      if (r) startClockIfComplete(r, TODAY);
      return d;
    },
    approve: (r: IntakeRecord, user: User, lead: Lead) => {
      if (!isDocsAdmin(user, lead.office_id)) throw new Error("admin_only");
      const s = summaryForBusiness(r.business_id)!;
      if (!s.approval.ok) throw new Error("not_ready");
      r.approved_at = new Date(`${TODAY}T15:00:00Z`).toISOString();
      r.approved_by = user.id;
    },
    resend: (r: IntakeRecord, contractId: Uuid) => {
      const c = contractsOf(r.business_id).find((x) => x.id === contractId);
      if (!c || !canResend(c)) throw new Error("invalid_state");
      for (const s of c.signers) if (s.status !== "signed") { s.status = "sent"; s.history = [...(s.history ?? []), { status: "sent", at: TODAY }]; }
      c.state = contractState(c);
      return c;
    },
    /** DocuSeal simulated: the signer is the current user (owner of the business, or any SM of the office for "sm"). */
    setSignerStatus: (c: Contract, party: "owner" | "sm" | "bishop", status: SignerStatus, reason?: string | null) => {
      const s = c.signers.find((x) => x.party === party);
      if (!s) throw new Error("not_signer");
      if (s.status === "signed" || s.status === "declined") throw new Error("invalid_state");
      if (status === "opened" && s.status === "opened") return c;
      s.status = status;
      s.history = [...(s.history ?? []), { status, at: TODAY }];
      if (status === "signed") s.signed_at = TODAY;
      if (status === "declined") s.decline_reason = reason?.trim() || null;
      c.state = contractState(c);
      if (c.state === "signed") c.signed_at = TODAY;
      return c;
    },
  };
}
export type Intake = ReturnType<typeof createIntake>;
