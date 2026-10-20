import { describe, expect, it } from "vitest";
import type { User } from "@/lib/api/types";
import { cleanTotpInput, groupSecret, isCompleteTotp, nextStepAfterSignIn } from "./two-factor";

const user = { id: "u-1", email: "carla@vossler.com", role: "business_owner" } as User;

describe("nextStepAfterSignIn", () => {
  it("a signed-in user goes to ?next= when it is a path of this app, else home", () => {
    expect(nextStepAfterSignIn(user, "/tareas?view=list")).toEqual({
      kind: "signed_in",
      href: "/tareas?view=list",
    });
    expect(nextStepAfterSignIn(user)).toEqual({ kind: "signed_in", href: "/" });
    expect(nextStepAfterSignIn(user, "https://evil.com")).toEqual({ kind: "signed_in", href: "/" });
    expect(nextStepAfterSignIn(user, "/login")).toEqual({ kind: "signed_in", href: "/" });
  });

  it("a challenge goes to /verificacion with the id in the history state and ?next= kept", () => {
    expect(
      nextStepAfterSignIn({ two_factor_required: true, challenge_id: "ch-1" }, "/perfil"),
    ).toEqual({
      kind: "verify",
      to: "/verificacion",
      search: { next: "/perfil" },
      state: { twoFactorChallenge: "ch-1" },
    });
  });

  it("a setup-required answer goes to /activar-verificacion with the token only in the state", () => {
    const step = nextStepAfterSignIn(
      { two_factor_setup_required: true, setup_token: "st-1" },
      "//evil.com",
    );
    expect(step).toEqual({
      kind: "setup",
      to: "/activar-verificacion",
      search: {},
      state: { setupToken: "st-1" },
    });
  });
});

describe("TOTP input helpers", () => {
  it("keeps only digits, at most 6", () => {
    expect(cleanTotpInput("123 456")).toBe("123456");
    expect(cleanTotpInput("12-34-56-78")).toBe("123456");
    expect(cleanTotpInput("abc")).toBe("");
  });

  it("a complete code has exactly 6 digits", () => {
    expect(isCompleteTotp("123456")).toBe(true);
    expect(isCompleteTotp("12345")).toBe(false);
    expect(isCompleteTotp("12345a")).toBe(false);
  });

  it("groups the secret in blocks of 4", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
  });
});
