// Bishops (SM Global): one row per Bishop with the state that decides what Global does next. Pure rules shared by the
// list, the detail and the tests. Built only from what the API answers: GET /users (role bishop), GET /contracts?kind=
// framework and GET /leads (bishop_user_id, bishop_accepted_at and funds of each opportunity).
import type { Contract, LeadWithComputed, User } from "@/lib/api/types";

/**
 * awaiting_sm: the CEO still has to sign the framework agreement ("Falta tu firma").
 * invited: the Bishop has not accepted the invitation yet.
 * awaiting_bishop: Corporate signed, the Bishop did not.
 * no_agreement: an older Bishop without framework agreement (POST /users/{id}/framework-agreement repairs it).
 * active: both signed, sees opportunities. investing: active and funding at least one program.
 */
export type BishopState = "awaiting_sm" | "invited" | "awaiting_bishop" | "no_agreement" | "active" | "investing";

/** Order of the list: what needs the CEO's signature first, then what needs someone else, then the settled ones. */
export const BISHOP_STATE_ORDER: BishopState[] = ["awaiting_sm", "invited", "awaiting_bishop", "no_agreement", "active", "investing"];

export interface BishopRow {
  user: User;
  contract: Contract | null;
  state: BishopState;
  /** The date that matters for the state (invited, sent or signed, active since, investing since); null when unknown. */
  date: string | null;
  /** Opportunities this Bishop took (accepted), newest first. */
  taken: LeadWithComputed[];
  /** Taken opportunities whose tripartite contract is signed: the Bishop funds that program. */
  funded: LeadWithComputed[];
}

const signed = (c: Contract, party: "bishop" | "sm") => {
  const s = c.signers.find((x) => x.party === party);
  return !!s && (s.status === "signed" || (!s.status && !!s.signed_at));
};

/** The Bishop's framework agreement among the list, or null. */
export const frameworkOf = (contracts: Contract[], userId: string) =>
  contracts.find((c) => c.signers.some((s) => s.party === "bishop" && s.user_id === userId)) ?? null;

export function bishopRowOf(user: User, contracts: Contract[], leads: LeadWithComputed[]): BishopRow {
  const contract = frameworkOf(contracts, user.id);
  const taken = leads
    .filter((l) => l.bishop_user_id === user.id && l.bishop_accepted_at)
    .sort((a, b) => (b.bishop_accepted_at ?? "").localeCompare(a.bishop_accepted_at ?? ""));
  const funded = taken.filter((l) => l.funds);
  const base = { user, contract, taken, funded };
  if ((user.status ?? "active") === "invited") return { ...base, state: "invited", date: user.invited_at ?? contract?.sent_at ?? null };
  if (!contract) return { ...base, state: "no_agreement", date: user.activated_at ?? null };
  const bishopSigned = signed(contract, "bishop");
  if (!signed(contract, "sm")) {
    const bishopSigner = contract.signers.find((s) => s.party === "bishop");
    return { ...base, state: "awaiting_sm", date: (bishopSigned ? bishopSigner?.signed_at : null) ?? contract.sent_at };
  }
  if (!bishopSigned) return { ...base, state: "awaiting_bishop", date: contract.sent_at };
  if (funded.length > 0) return { ...base, state: "investing", date: funded.at(-1)?.bishop_accepted_at ?? null };
  return { ...base, state: "active", date: contract.signed_at ?? latestSignature(contract) };
}

const latestSignature = (c: Contract) =>
  c.signers.map((s) => s.signed_at).filter((d): d is string => !!d).sort().at(-1) ?? null;

/** Every Bishop (inactive ones excluded), CEO's signature first, then by state and name. */
export function bishopRows(users: User[], contracts: Contract[], leads: LeadWithComputed[]): BishopRow[] {
  return users
    .filter((u) => u.role === "bishop" && (u.status ?? "active") !== "inactive")
    .map((u) => bishopRowOf(u, contracts, leads))
    .sort((a, b) => BISHOP_STATE_ORDER.indexOf(a.state) - BISHOP_STATE_ORDER.indexOf(b.state) || a.user.full_name.localeCompare(b.user.full_name));
}

/** One counter per state, so every Bishop falls in exactly one of them. */
export type BishopCounts = Record<BishopState, number>;

export const bishopCounts = (rows: BishopRow[]): BishopCounts =>
  Object.fromEntries(BISHOP_STATE_ORDER.map((state) => [state, rows.filter((r) => r.state === state).length])) as BishopCounts;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Search by name, ignoring case and accents. */
export const matchesName = (row: BishopRow, query: string) => !fold(query) || fold(row.user.full_name).includes(fold(query));

/** The one primary action of each state. "view" opens the detail. */
export type BishopAction = "resend" | "sign" | "create" | "view";

export function primaryActionOf(row: BishopRow): BishopAction {
  if (row.state === "invited") return "resend";
  if (row.state === "awaiting_sm") return row.contract?.can_sign === false ? "view" : "sign";
  if (row.state === "no_agreement") return "create";
  return "view";
}

/** First name of whoever signs the framework agreements for Strategic Mates (Corporate's CEO), from the contracts. */
export function ceoFirstName(contracts: Contract[]): string | null {
  const name = contracts.map((c) => c.signers.find((s) => s.party === "sm")?.name).find((n) => !!n?.trim());
  return name ? name.trim().split(/\s+/)[0]! : null;
}
