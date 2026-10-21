// Who still has to sign a contract, and whether the current person may sign it now. Pure rules shared by the mock
// (which fills `can_sign`, `my_signature` and `pending_parties` as the API does) and the screens (which read them,
// or fall back to the signers when an older answer has none).
import type { Contract, ContractParty, Signer } from "@/lib/api/types";
import { smSignBlock } from "@/lib/leads/contract-rules";

const isSigned = (s: Signer) => s.status === "signed" || (!s.status && !!s.signed_at);

type Signable = Pick<Contract, "signers"> & Partial<Pick<Contract, "pending_parties" | "my_signature" | "state">>;

/** Names of the parties that have not signed yet, in the contract's order. The API's `pending_parties` wins. */
export function pendingPartyNames(c: Signable): string[] {
  if (c.pending_parties) return c.pending_parties;
  return c.signers.flatMap((s) => (isSigned(s) ? [] : [s.name]));
}

export interface SigningStatus {
  /** Every party signed. */
  all: boolean;
  /** This party already signed. */
  mine: boolean;
  /** Names of the parties still to sign (this one excluded once it signed). */
  pending: string[];
}

/** "Firmado por ti, falta Strategic Mates Corporate" / "Firmado por todos", as one party reads a contract. */
export function signingStatus(c: Signable, party: ContractParty): SigningStatus {
  const pending = pendingPartyNames(c);
  const me = c.signers.find((s) => s.party === party);
  const mine = c.my_signature ? c.my_signature === "signed" : !!me && isSigned(me);
  return { all: c.state === "signed" || (c.signers.length > 0 && pending.length === 0), mine, pending };
}

export interface SigningPerson {
  id: string;
  role: string;
  organization_id?: string | null | undefined;
  business_id?: string | null | undefined;
  can_sign_sm_square?: boolean | undefined;
}

/**
 * Whether `user` may sign `c` as `party` right now: the signer of that party is still pending and belongs to the
 * person (the owner of the business, that Bishop, or an SM person the SM signer allows, see smSignBlock). SM Global
 * signs for Strategic Mates wherever the SM signer names nobody or names them (Corporate's CEO on the binding
 * agreement, the framework agreements).
 */
export function canSignAs(
  c: Pick<Contract, "signers" | "business_id">,
  user: SigningPerson,
  party: ContractParty,
  options: { officeId?: string | null | undefined } = {},
): boolean {
  const s = c.signers.find((x) => x.party === party);
  if (!s || isSigned(s) || s.status === "declined") return false;
  if (party === "owner") return user.role === "business_owner" && !!user.business_id && user.business_id === c.business_id;
  if (party === "bishop") return user.role === "bishop" && (!s.user_id || s.user_id === user.id);
  const isSm = user.role === "sm_global" || (user.role === "sm_team" && (!options.officeId || user.organization_id === options.officeId));
  return isSm && smSignBlock(s, user) === null;
}

/** The party the person signs a contract as, or null when none. */
export function signingPartyOf(user: Pick<SigningPerson, "role">): ContractParty | null {
  if (user.role === "business_owner") return "owner";
  if (user.role === "bishop") return "bishop";
  if (user.role === "sm_team" || user.role === "sm_global") return "sm";
  return null;
}

/** The contract with the per-person fields the API sends (can_sign, my_signature, pending_parties), for the mock. */
export function withSigningView<T extends Contract>(c: T, user: SigningPerson, options: { officeId?: string | null | undefined } = {}): T {
  const party = signingPartyOf(user);
  const me = party ? c.signers.find((s) => s.party === party) : undefined;
  return {
    ...c,
    can_sign: !!party && canSignAs(c, user, party, options),
    my_signature: me ? (isSigned(me) ? "signed" : "pending") : null,
    pending_parties: pendingPartyNames({ signers: c.signers }),
  };
}
