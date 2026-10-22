import { describe, expect, it } from "vitest";
import type { Contract, LeadWithComputed, User } from "@/lib/api/types";
import { bishopCounts, bishopRows, ceoFirstName, matchesName, primaryActionOf } from "./status";

const user = (id: string, name: string, status: User["status"] = "active", extra: Partial<User> = {}): User => ({
  id, full_name: name, email: `${id}@x.com`, role: "bishop", organization_id: null, business_id: null, title: null,
  google_calendar_email: null, booking_url: null, status, invited_at: "2026-10-01T10:00:00Z", activated_at: "2026-10-02T10:00:00Z", ...extra,
});

const framework = (userId: string, bishopOn: string | null, smOn: string | null, canSign = true): Contract => ({
  id: `c-${userId}`, business_id: "", area: "intake", kind: "framework", name: "Acuerdo marco", state: bishopOn && smOn ? "signed" : "sent",
  sent_at: "2026-10-01", signed_at: bishopOn && smOn ? (bishopOn > smOn ? bishopOn : smOn) : null, can_sign: canSign,
  signers: [
    { name: "B", role: "bishop", party: "bishop", user_id: userId, status: bishopOn ? "signed" : "sent", signed_at: bishopOn },
    { name: "Marilyn Boraei", role: "sm", party: "sm", user_id: "ceo", status: smOn ? "signed" : "sent", signed_at: smOn },
  ],
} as Contract);

const lead = (bishop: string, accepted: string, funded: boolean) =>
  ({ id: `l-${bishop}-${accepted}`, bishop_user_id: bishop, bishop_accepted_at: accepted, business_id: funded ? "b1" : null,
    funds: funded ? { status: "received", to_confirm: false, ready_to_start: false, proposed_day1: null } : null }) as unknown as LeadWithComputed;

const users = [
  user("zoe", "Zoe Active"),
  user("ana", "Ana Invited", "invited"),
  user("ivan", "Iván Investing"),
  user("pia", "Pía Pending"),
  user("old", "Old Inactive", "inactive"),
  { ...user("sm", "Not a Bishop"), role: "sm_global" as const },
];
const contracts = [framework("zoe", "2026-03-01", "2026-03-02"), framework("ana", null, null), framework("ivan", "2025-10-30", "2025-10-28"), framework("pia", "2026-10-12", null)];
const leads = [lead("ivan", "2026-07-25T00:00:00Z", true), lead("ivan", "2026-10-03T00:00:00Z", true), lead("zoe", "2026-09-01T00:00:00Z", false)];

describe("Bishops list", () => {
  const rows = bishopRows(users, contracts, leads);

  it("one row per Bishop (inactive and other roles left out), the CEO's signature first", () => {
    expect(rows.map((r) => r.user.id)).toEqual(["pia", "ana", "zoe", "ivan"]);
    expect(rows.map((r) => r.state)).toEqual(["awaiting_sm", "invited", "active", "investing"]);
  });

  it("each state carries the date that matters", () => {
    const by = Object.fromEntries(rows.map((r) => [r.user.id, r.date]));
    expect(by["pia"]).toBe("2026-10-12");
    expect(by["ana"]).toBe("2026-10-01T10:00:00Z");
    expect(by["zoe"]).toBe("2026-03-02");
    expect(by["ivan"]).toBe("2026-07-25T00:00:00Z");
  });

  it("taken opportunities newest first; only those with funds count as investing", () => {
    const ivan = rows.find((r) => r.user.id === "ivan")!;
    expect(ivan.taken.map((l) => l.bishop_accepted_at)).toEqual(["2026-10-03T00:00:00Z", "2026-07-25T00:00:00Z"]);
    expect(rows.find((r) => r.user.id === "zoe")!.funded).toEqual([]);
  });

  it("counters: Esperan tu firma, Invitados sin aceptar, Activos, Invirtiendo", () => {
    expect(bishopCounts(rows)).toEqual({ awaiting_sm: 1, invited: 1, active: 1, investing: 1 });
  });

  it("one primary action per state", () => {
    expect(rows.map((r) => primaryActionOf(r))).toEqual(["sign", "resend", "view", "view"]);
    const noAgreement = bishopRows([user("x", "X")], [], [])[0]!;
    expect(noAgreement.state).toBe("no_agreement");
    expect(primaryActionOf(noAgreement)).toBe("create");
    const signedBySm = bishopRows([user("y", "Y")], [framework("y", null, "2026-10-01")], [])[0]!;
    expect(signedBySm.state).toBe("awaiting_bishop");
    expect(primaryActionOf(signedBySm)).toBe("view");
    // Someone of SM Global who may not sign for Corporate sees "Ver" instead.
    expect(primaryActionOf(bishopRows([user("p", "P")], [framework("p", null, null, false)], [])[0]!)).toBe("view");
  });

  it("search by name ignores case and accents", () => {
    const ivan = rows.find((r) => r.user.id === "ivan")!;
    expect(matchesName(ivan, "ivan")).toBe(true);
    expect(matchesName(ivan, "  IVÁN ")).toBe(true);
    expect(matchesName(ivan, "pia")).toBe(false);
    expect(matchesName(ivan, "")).toBe(true);
  });

  it("the CEO's first name comes from the SM signer of the agreements", () => {
    expect(ceoFirstName(contracts)).toBe("Marilyn");
    expect(ceoFirstName([])).toBeNull();
  });
});
