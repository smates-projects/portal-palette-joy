// Entry flow in the mock: the NDA at booking (Strategic Mates pre-signed), the MOU as soon as the owner signs the NDA
// (the four points he confirms), the due diligence documents after "Se hizo" (locked until the MOU is signed), the
// owner's own NDA (he writes it, Strategic Mates signs it), the review clock and the approval. The real backend gets
// the DocuSeal events by webhook; here signing is simulated through the same repository calls.
import { todayIso } from "@/lib/clock";
import { summarizeIntake, isDocsAdmin, canResend } from "@/lib/leads/onboarding";
import { entryRules, fillOwnNdaTemplate, oaWaitingUntil, ownNdaBodyError, signBlock, validAcknowledgment } from "@/lib/leads/entry-flow";
import { typedSignatureDataUrl } from "@/lib/contracts/signature";
import { DEFAULT_OWNER_NDA_TEMPLATE } from "../franchisability";
import type {
  Business, BusinessDocument, Contract, IntakeSummary, Lead, MouAcknowledgmentPoint, Organization, OwnerEntry, Signer, SignerStatus, User, Uuid,
} from "../types";
import type { PlatformRules } from "../network-types";
import type { EntryContractRule } from "../entry-types";
import { fillContractTemplate } from "@/lib/leads/contract-rules";
import { MOU_EXPLAINER, NDA_EXPLAINER, OWNER_NDA_EXPLAINER, mouBody, ndaBody } from "./contract-texts";

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
  orgs: Organization[];
  businesses: Business[];
  documents: BusinessDocument[];
  contracts: Contract[];
  rules: PlatformRules;
  intakes: IntakeRecord[];
  /** Entry contract rules (./contract-rules): the NDA and the MOU take their name, window and text from them. */
  contractRules?: EntryContractRule[] | undefined;
}

/** A mock error with the API's detail (waiting_period carries the date the signature opens). */
export const mockError = (code: string, detail?: string) => Object.assign(new Error(code), { code, detail: detail ?? null });

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

/** Strategic Mates already signed on the day it went out, with the office signature (typed sample in the mock). */
const preSignedSm = (sentOn: string): Signer => ({
  name: "Strategic Mates", role: "sm", party: "sm", user_id: null, status: "signed",
  history: [{ status: "sent", at: sentOn }, { status: "signed", at: sentOn }],
  signed_at: sentOn, decline_reason: null, signature: { kind: "typed", image_url: typedSignatureDataUrl("Strategic Mates") },
});

export const contractState = (c: Contract): Contract["state"] =>
  c.signers.some((s) => s.status === "declined") ? "declined"
    : c.signers.every((s) => s.status === "signed") ? "signed"
      : c.signers.some((s) => s.status === "opened" || s.status === "signed") ? "opened" : "sent";

const settle = (c: Contract) => {
  c.state = contractState(c);
  c.signed_at = c.state === "signed" ? c.signers.map((s) => s.signed_at ?? "").sort().at(-1) ?? null : null;
  return c;
};

export function createIntake(db: IntakeDb, newId: () => string) {
  const record = (leadId: Uuid) => db.intakes.find((i) => i.lead_id === leadId);
  const docsOf = (businessId: Uuid) => db.documents.filter((d) => d.business_id === businessId && d.area === "intake");
  const contractsOf = (businessId: Uuid) => db.contracts.filter((c) => c.business_id === businessId && c.area === "intake");
  const contractOf = (businessId: Uuid, kind: "nda" | "mou" | "owner_nda") => contractsOf(businessId).find((c) => c.kind === kind);
  const businessName = (businessId: Uuid) => db.businesses.find((b) => b.id === businessId)?.name ?? "";
  const ownerOf = (businessId: Uuid) => db.users.find((u) => u.role === "business_owner" && u.business_id === businessId);
  const signedBy = (c: Contract | undefined, party: "owner" | "sm") => !!c?.signers.some((s) => s.party === party && s.status === "signed");
  const rules = () => entryRules(db.rules);

  /** What the owner's "Tu ingreso" needs from the lead: meetings and the consultant's booking link. */
  const ownerEntry = (lead: Lead | undefined): OwnerEntry | null => {
    if (!lead) return null;
    const consultant = db.users.find((u) => u.id === lead.consultant_user_id);
    const office = db.orgs.find((o) => o.id === lead.office_id);
    return {
      meeting: lead.meeting,
      expansion_meeting: lead.expansion_meeting ?? null,
      expansion_meeting_held_at: lead.expansion_meeting_held_at ?? null,
      validation: lead.validation
        ? { status: lead.validation.status, equity_owner: lead.validation.equity_owner, equity_bishop: lead.validation.equity_bishop, equity_sm: lead.validation.equity_sm, closed_at: lead.validation.closed_at }
        : null,
      booking_url: consultant?.booking_url || office?.default_booking_url || null,
      consultant_name: consultant?.full_name ?? null,
    };
  };

  const summaryForBusiness = (businessId: Uuid): IntakeSummary | null => {
    const r = db.intakes.find((i) => i.business_id === businessId);
    if (!r) return null;
    const mou = contractOf(businessId, "mou");
    const own = contractOf(businessId, "owner_nda");
    return {
      ...summarizeIntake({
        business_id: businessId, contracts: contractsOf(businessId), docs: docsOf(businessId),
        started_at: r.review_started_at, approved_at: r.approved_at, review_days: db.rules.document_review_days,
      }),
      mou_sent: !!mou,
      mou_signed_by_owner: signedBy(mou, "owner"),
      entry: ownerEntry(db.leads.find((l) => l.id === r.lead_id)),
      own_nda: own ? { id: own.id, state: own.state, signed_by_sm: signedBy(own, "sm"), signed_by_owner: signedBy(own, "owner") } : null,
    };
  };
  const summaryFor = (lead: Lead): IntakeSummary | null => (lead.business_id && record(lead.id) ? summaryForBusiness(lead.business_id) : null);

  /** The active rule of the NDA or the MOU (Corporate may have changed its name, window or text). */
  const ruleOf = (kind: "nda" | "mou") => db.contractRules?.find((r) => r.kind === kind && r.active);

  const makeContract = (kind: "nda" | "mou", businessId: Uuid, ownerName: string, ownerId: Uuid | null, sentOn: string, ownerSteps: SignerStatus[], smSteps: SignerStatus[] | "pre_signed"): Contract => {
    const rule = ruleOf(kind);
    const lead = db.leads.find((l) => l.business_id === businessId);
    const values = {
      business_name: businessName(businessId), owner_name: ownerName, date: sentOn,
      owner_email: db.users.find((u) => u.id === ownerId)?.email ?? lead?.contact.email, business_activity: lead?.business.activity,
    };
    return settle({
      id: newId(), business_id: businessId, area: "intake", kind, name: rule?.name ?? (kind === "nda" ? "NDA mutuo" : "MOU"),
      ...(rule ? { rule_code: rule.code } : {}),
      state: "sent", sent_at: sentOn, signed_at: null,
      explainer: rule ? structuredClone(rule.explainer) : kind === "nda" ? NDA_EXPLAINER : MOU_EXPLAINER,
      body: rule ? fillContractTemplate(rule.template, values) : (kind === "nda" ? ndaBody : mouBody)(values.business_name, ownerName, values),
      signers: [
        { ...signer("owner", ownerName, ownerId, sentOn, ownerSteps), ...(kind === "mou" ? { acknowledgments: [] } : {}) },
        { ...(smSteps === "pre_signed" ? preSignedSm(sentOn) : signer("sm", "Strategic Mates", null, sentOn, smSteps)), sm_entity: "corporate" as const },
      ],
    });
  };

  const makeDocs = (businessId: Uuid, requestedOn: string, locked: boolean): BusinessDocument[] =>
    db.rules.intake_documents.filter((r) => !r.archived).map((r) => ({
      id: newId(), business_id: businessId, area: "intake", name: r.name, state: "requested", requested_at: requestedOn,
      received_at: null, file_name: null, required: r.required, rule_id: r.id, only_if_llc: r.only_if_llc, verified_hint: r.verified_hint,
      verified_fact: null, review_comment: null, reviewed_at: null, pauses: [], locked_until_mou: locked,
    }));

  /**
   * At booking (or "Enviar NDA" for a lead moved by hand): owner account (no password: the email carries the entry
   * link), business in onboarding and the mutual NDA, Strategic Mates pre-signed when the rule says so.
   */
  const open = (lead: Lead, opts: { sentOn: string; ownerId?: Uuid; businessId?: Uuid; ownerSteps?: SignerStatus[]; smSteps?: SignerStatus[] }) => {
    if (record(lead.id)) throw new Error("invalid_state");
    const existing = db.users.find((u) => u.role === "business_owner" && u.email.toLowerCase() === lead.contact.email.toLowerCase());
    const ownerId = existing?.id ?? opts.ownerId ?? newId();
    const businessId = existing?.business_id ?? opts.businessId ?? newId();
    if (!existing)
      db.users.push({
        id: ownerId, full_name: lead.contact.name, email: lead.contact.email, role: "business_owner", organization_id: null,
        business_id: businessId, title: null, google_calendar_email: null, booking_url: null,
      });
    if (!db.businesses.some((b) => b.id === businessId))
      db.businesses.push({
        id: businessId, name: lead.business.name, industry: lead.business.activity, city: lead.contact.city, state: lead.contact.state,
        owner_user_id: ownerId, status: "onboarding", program_start_date: opts.sentOn, program_day: 0, office_id: lead.office_id,
        consultant_id: lead.consultant_user_id,
      });
    lead.business_id = businessId;
    const smSteps = opts.smSteps ?? (rules().nda_auto_signed_by_sm ? "pre_signed" : []);
    db.contracts.push(makeContract("nda", businessId, lead.contact.name, ownerId, opts.sentOn, opts.ownerSteps ?? [], smSteps));
    const r: IntakeRecord = { lead_id: lead.id, business_id: businessId, review_started_at: null, approved_at: null, approved_by: null };
    db.intakes.push(r);
    return r;
  };

  /**
   * The MOU with its four points. It exists as soon as the owner signs the NDA, so he can read it and sign it during
   * the meeting (or before). Answers the existing one when it is already there.
   */
  const createMou = (r: IntakeRecord, ownerName: string, opts: { sentOn: string; ownerSteps?: SignerStatus[]; smSteps?: SignerStatus[] }) => {
    const existing = contractOf(r.business_id, "mou");
    if (existing) return { mou: existing, created: false };
    const owner = ownerOf(r.business_id);
    const smSteps = opts.smSteps ?? (rules().nda_auto_signed_by_sm ? "pre_signed" : []);
    const mou = makeContract("mou", r.business_id, owner?.full_name ?? ownerName, owner?.id ?? null, opts.sentOn, opts.ownerSteps ?? [], smSteps);
    db.contracts.push(mou);
    return { mou, created: true };
  };

  /** "Se hizo": the entry documents list, locked until the owner signs the MOU. Once per business. */
  const sendDocuments = (r: IntakeRecord, sentOn: string) => {
    if (docsOf(r.business_id).length > 0) return false;
    db.documents.push(...makeDocs(r.business_id, sentOn, !signedBy(contractOf(r.business_id, "mou"), "owner")));
    return true;
  };

  /**
   * After "Se hizo" (or "Enviar MOU" for a lead moved by hand): the MOU if the NDA signature did not create it yet,
   * and the documents list. invalid_state when both were already there.
   */
  const sendMou = (r: IntakeRecord, lead: Lead, opts: { sentOn: string; ownerSteps?: SignerStatus[]; smSteps?: SignerStatus[] }) => {
    const { mou, created } = createMou(r, lead.contact.name, opts);
    const sent = sendDocuments(r, opts.sentOn);
    if (!created && !sent) throw new Error("invalid_state");
    return mou;
  };

  /** The owner signed the NDA: his MOU appears right away. Answers it only when it was just created. */
  const mouOnNdaSigned = (c: Contract) => {
    if (c.kind !== "nda" || !signedBy(c, "owner")) return null;
    const r = db.intakes.find((i) => i.business_id === c.business_id);
    if (!r) return null;
    const { mou, created } = createMou(r, ownerOf(c.business_id)?.full_name ?? "", { sentOn: todayIso() });
    return created ? mou : null;
  };

  // ---------- The owner's own NDA (kind owner_nda) ----------
  const ownNdaTemplate = (businessId: Uuid) =>
    fillOwnNdaTemplate(db.rules.owner_nda_template ?? DEFAULT_OWNER_NDA_TEMPLATE, {
      business_name: businessName(businessId), owner_name: ownerOf(businessId)?.full_name ?? "",
    });

  const checkBody = (body: string) => {
    const error = ownNdaBodyError(body);
    if (error) throw new Error(error);
  };

  /** The owner sends his text: Strategic Mates signs it (any SM person of the office), the owner may sign too. */
  const createOwnNda = (businessId: Uuid, body: string) => {
    if (!db.intakes.some((i) => i.business_id === businessId)) throw new Error("invalid_state");
    if (contractOf(businessId, "owner_nda")) throw new Error("own_nda_exists");
    checkBody(body);
    const owner = ownerOf(businessId);
    const today = todayIso();
    const c: Contract = {
      id: newId(), business_id: businessId, area: "intake", kind: "owner_nda", name: "Acuerdo de confidencialidad del dueño",
      state: "sent", sent_at: today, signed_at: null, explainer: OWNER_NDA_EXPLAINER, body: body.trim(),
      signers: [signer("owner", owner?.full_name ?? "", owner?.id ?? null, today), signer("sm", "Strategic Mates", null, today)],
    };
    db.contracts.push(c);
    return c;
  };

  /** Editing is allowed only while nobody signed it. */
  const updateOwnNda = (businessId: Uuid, body: string) => {
    const c = contractOf(businessId, "owner_nda");
    if (!c) throw new Error("not_found");
    if (c.signers.some((s) => s.status === "signed")) throw new Error("invalid_state");
    checkBody(body);
    c.body = body.trim();
    return c;
  };

  const unlockDocuments = (businessId: Uuid) => {
    for (const d of docsOf(businessId)) d.locked_until_mou = false;
  };

  const startClockIfComplete = (r: IntakeRecord, today: string) => {
    if (r.review_started_at) return;
    const required = docsOf(r.business_id).filter((d) => d.required);
    if (required.length > 0 && required.every((d) => d.state !== "requested")) r.review_started_at = today;
  };

  /**
   * Leads added after the first sample set get a fixed slot, so the owner and business ids of every other lead
   * (numbered in list order) do not shift.
   */
  const FIXED_SLOTS: Record<string, number> = { "Navarro Cercas y Portones": 900, "Rivera Roofing & Remodel": 901 };

  /** Sample entry data for leads already booked, in Documentación or in Aceptado. Same ids every run. */
  const seed = () => {
    let n = 0;
    for (const lead of db.leads) {
      if (lead.business_id) continue;
      // In Reunión with a booked meeting: the booking created the account and the NDA (SM pre-signed); Javier opened
      // it and has not signed yet.
      if (lead.stage === "meeting" && lead.meeting && FIXED_SLOTS[lead.business.name]) {
        const slot = FIXED_SLOTS[lead.business.name]!;
        open(lead, { sentOn: lead.meeting.booked_at.slice(0, 10), ownerId: sid("0d100000", slot), businessId: sid("0b100000", slot), ownerSteps: ["opened"] });
        continue;
      }
      if (lead.stage !== "documents" && lead.stage !== "accepted") continue;
      const slot = FIXED_SLOTS[lead.business.name] ?? ++n;
      const docsOn = lead.stage_entered_at.slice(0, 10);
      const accepted = lead.stage === "accepted";
      const ndaOn = accepted ? addDays(docsOn, -10) : addDays(docsOn, 0);
      const r = open(lead, {
        sentOn: ndaOn, ownerId: sid("0d100000", slot), businessId: sid("0b100000", slot),
        ownerSteps: ["opened", "signed"], smSteps: ["signed"],
      });
      const morales = lead.business.name === "Morales Pisos y Cerámica";
      // Morales: the MOU waits for her (she opened it, has not confirmed the four points): her documents stay locked.
      const mou = sendMou(r, lead, { sentOn: ndaOn, ownerSteps: morales ? ["opened"] : ["opened", "signed"], smSteps: ["signed"] });
      if (!morales) {
        const owner = mou.signers.find((s) => s.party === "owner")!;
        owner.acknowledgments = ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"];
        unlockDocuments(r.business_id);
      }
      const docs = docsOf(r.business_id);
      const signedOn = addDays(ndaOn, 2);
      const upload = (d: BusinessDocument, on: string) => Object.assign(d, { state: "received", received_at: on, file_name: `${d.name.split(" (")[0]}.pdf` });
      const accept = (d: BusinessDocument, on: string) => Object.assign(d, { state: "reviewed", reviewed_at: on, verified_fact: d.verified_hint ?? null });
      if (lead.business.name === "Castillo Instalaciones") {
        // 5 of 9 required uploaded, 3 accepted, 1 asked again (clock paused), the rest still missing.
        docs.forEach((d, i) => {
          if (i <= 2) { upload(d, addDays(signedOn, 1)); accept(d, addDays(signedOn, 2)); }
          if (i === 3) upload(d, addDays(signedOn, 2));
          if (i === 6) {
            upload(d, addDays(signedOn, 1));
            Object.assign(d, { state: "rejected", reviewed_at: addDays(signedOn, 2), review_comment: "Faltan julio y agosto. Sube los 12 meses, por favor.", pauses: [{ from: addDays(signedOn, 2), to: null }] });
          }
        });
      } else if (morales) {
        // Nothing uploaded: the list opens when she signs the MOU.
      } else if (lead.business.name === "Navarro Cercas y Portones") {
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
  const ownerSigner = (c: Contract) => {
    const s = c.signers.find((x) => x.party === "owner");
    if (!s) throw new Error("not_signer");
    return s;
  };

  return {
    seed,
    open,
    sendMou,
    sendDocuments,
    mouOnNdaSigned,
    ownNdaTemplate,
    createOwnNda,
    updateOwnNda,
    record,
    summaryFor,
    summaryForBusiness,
    docsOf,
    contractsOf,
    contractOf,
    acceptDocument: (r: IntakeRecord, docId: Uuid, fact: string) => {
      const d = findDoc(r.business_id, docId);
      if (d.state !== "received") throw new Error("invalid_state");
      if (!fact.trim()) throw new Error("fact_required");
      Object.assign(d, { state: "reviewed", reviewed_at: todayIso(), verified_fact: fact.trim(), review_comment: null });
      return d;
    },
    requestAgain: (r: IntakeRecord, docId: Uuid, comment: string) => {
      const d = findDoc(r.business_id, docId);
      if (d.state !== "received" && d.state !== "reviewed") throw new Error("invalid_state");
      if (!comment.trim()) throw new Error("comment_required");
      Object.assign(d, { state: "rejected", reviewed_at: todayIso(), review_comment: comment.trim(), verified_fact: null, pauses: [...(d.pauses ?? []), { from: todayIso(), to: null }] });
      return d;
    },
    /** Owner upload of an entry document: locked until he signs the MOU. Closes the pause of a replacement. */
    upload: (businessId: Uuid, d: BusinessDocument, fileName: string) => {
      if (d.locked_until_mou) throw new Error("mou_required");
      if (d.state !== "requested" && d.state !== "rejected") throw new Error("invalid_state");
      for (const p of d.pauses ?? []) if (!p.to) p.to = todayIso();
      Object.assign(d, { state: "received", received_at: todayIso(), file_name: fileName });
      const r = db.intakes.find((i) => i.business_id === businessId);
      if (r) startClockIfComplete(r, todayIso());
      return d;
    },
    approve: (r: IntakeRecord, user: User, lead: Lead) => {
      if (!isDocsAdmin(user, lead.office_id)) throw new Error("admin_only");
      const s = summaryForBusiness(r.business_id)!;
      if (!s.approval.ok) throw new Error("not_ready");
      r.approved_at = new Date(`${todayIso()}T15:00:00Z`).toISOString();
      r.approved_by = user.id;
    },
    resend: (r: IntakeRecord, contractId: Uuid) => {
      const c = contractsOf(r.business_id).find((x) => x.id === contractId);
      if (!c || !canResend(c)) throw new Error("invalid_state");
      for (const s of c.signers) if (s.status !== "signed") { s.status = "sent"; s.history = [...(s.history ?? []), { status: "sent", at: todayIso() }]; }
      c.state = contractState(c);
      return c;
    },
    /** Owner, MOU: the four points with "Entendí". */
    acknowledge: (c: Contract, points: MouAcknowledgmentPoint[]) => {
      if (c.kind !== "mou") throw new Error("invalid_state");
      const s = ownerSigner(c);
      if (s.status === "signed" || s.status === "declined") throw new Error("invalid_state");
      if (!validAcknowledgment(points)) throw new Error("invalid_points");
      s.acknowledgments = [...points];
      return c;
    },
    /**
     * DocuSeal simulated: the signer is the current user (owner of the business, or any SM of the office for "sm").
     * The owner's MOU needs the four points; the Operating Agreement waits for its waiting period. Signing the NDA
     * creates the MOU (the caller tells the owner); signing the MOU opens the documents.
     */
    setSignerStatus: (c: Contract, party: "owner" | "sm" | "bishop", status: SignerStatus, reason?: string | null) => {
      const s = c.signers.find((x) => x.party === party);
      if (!s) throw new Error("not_signer");
      if (s.status === "signed" || s.status === "declined") throw new Error("invalid_state");
      if (status === "opened" && s.status === "opened") return c;
      if (status === "signed") {
        const block = signBlock(c, party);
        if (block) throw new Error(block);
        const until = oaWaitingUntil(c, rules().oa_waiting_days, todayIso());
        if (until) throw mockError("waiting_period", until);
      }
      s.status = status;
      s.history = [...(s.history ?? []), { status, at: todayIso() }];
      if (status === "signed") s.signed_at = todayIso();
      if (status === "declined") s.decline_reason = reason?.trim() || null;
      c.state = contractState(c);
      if (c.state === "signed") c.signed_at = todayIso();
      if (c.kind === "mou" && party === "owner" && status === "signed") unlockDocuments(c.business_id);
      return c;
    },
  };
}
export type Intake = ReturnType<typeof createIntake>;
