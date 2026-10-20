import { TODAY } from "@/config/app";
import type { BusinessDocument, Contract, DocsApproval, IntakeSummary, ReviewClock, User, Uuid } from "@/lib/api/types";

const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / 86_400_000);
const later = (a: string, b: string) => (a > b ? a : b);

/** Days before the end when the clock turns amber (15 days → amber from day 11). */
export const REVIEW_AMBER_BEFORE = 4;
/** Days without signing after which SM can resend a contract. */
export const RESEND_AFTER_DAYS = 3;

/**
 * Review clock. Starts when the owner uploaded every required document (`started_at`), pauses while SM waits for a
 * replacement (document asked again), and stops at the approval. Amber from `total - 4`, red after `total`.
 */
export function reviewClock(input: {
  started_at: string | null;
  approved_at: string | null;
  docs: Pick<BusinessDocument, "state" | "pauses">[];
  total: number;
  today?: string;
}): ReviewClock {
  const today = input.today ?? TODAY;
  const paused = input.docs.some((d) => d.state === "rejected");
  const end = input.approved_at ? input.approved_at.slice(0, 10) : today;
  let day = 0;
  if (input.started_at) {
    const start = input.started_at.slice(0, 10);
    let pausedDays = 0;
    for (const d of input.docs)
      for (const p of d.pauses ?? []) {
        const from = later(p.from, start);
        const to = p.to && p.to < end ? p.to : end;
        if (to > from) pausedDays += daysBetween(from, to);
      }
    day = Math.max(1, daysBetween(start, end) - pausedDays);
  }
  const status = input.approved_at ? "done" : paused ? "paused" : input.started_at ? "running" : "waiting_upload";
  const tone = status === "done" || day === 0 ? "ok" : day > input.total ? "red" : day >= input.total - REVIEW_AMBER_BEFORE ? "amber" : "ok";
  return { status, day, total: input.total, tone };
}

const signedBy = (c: Contract | undefined, party: "owner" | "sm") => !!c?.signers.some((s) => s.party === party && s.status === "signed");
export const fullySigned = (c: Contract | undefined) => !!c && c.signers.length > 0 && c.signers.every((s) => s.status === "signed");

/** "Aprobar documentación" needs NDA and MOU signed by both and every required document accepted. */
export function docsApproval(contracts: Contract[], docs: BusinessDocument[]): DocsApproval {
  // A contract not sent yet (the MOU before "Se hizo") is missing too, under its usual name.
  const unsigned = (["nda", "mou"] as const)
    .map((k) => ({ k, c: contracts.find((c) => c.kind === k) }))
    .filter(({ c }) => !fullySigned(c));
  if (unsigned.length) return { ok: false, reason: "contracts", missing: unsigned.map(({ k, c }) => c?.name ?? (k === "nda" ? "NDA mutuo" : "MOU")) };
  const missing = docs.filter((d) => d.required && d.state !== "reviewed").map((d) => d.name);
  return missing.length ? { ok: false, reason: "documents", missing } : { ok: true };
}

/** Admin of that office, or an SM Global admin. Never the owner or a Bishop. */
export const isDocsAdmin = (u: Pick<User, "role" | "is_admin" | "organization_id"> | undefined, officeId: Uuid) =>
  !!u?.is_admin && (u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === officeId));

export function summarizeIntake(input: {
  business_id: Uuid;
  contracts: Contract[];
  docs: BusinessDocument[];
  started_at: string | null;
  approved_at: string | null;
  review_days: number;
  today?: string;
}): IntakeSummary {
  const required = input.docs.filter((d) => d.required);
  const nda = input.contracts.find((c) => c.kind === "nda");
  const mou = input.contracts.find((c) => c.kind === "mou");
  return {
    business_id: input.business_id,
    required_total: required.length,
    uploaded: required.filter((d) => d.state !== "requested").length,
    accepted: required.filter((d) => d.state === "reviewed").length,
    to_review: input.docs.filter((d) => d.state === "received").length,
    nda_signed: fullySigned(nda),
    mou_signed: fullySigned(mou),
    nda_signed_by_owner: signedBy(nda, "owner"),
    clock: reviewClock({ started_at: input.started_at, approved_at: input.approved_at, docs: input.docs, total: input.review_days, ...(input.today ? { today: input.today } : {}) }),
    approval: docsApproval(input.contracts, input.docs),
    approved_at: input.approved_at,
  };
}

/** SM can resend when the signer has not signed and the last send is older than 3 days. */
export function canResend(c: Contract, today: string = TODAY) {
  if (fullySigned(c) || !c.sent_at) return false;
  const lastSent = (c.signers.flatMap((s) => s.history ?? []).filter((h) => h.status === "sent").map((h) => h.at).sort().at(-1)) ?? c.sent_at;
  return daysBetween(lastSent, today) >= RESEND_AFTER_DAYS;
}
