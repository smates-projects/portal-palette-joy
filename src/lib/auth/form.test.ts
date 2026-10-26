import { describe, expect, it } from "vitest";
import es from "@/locales/es.json";
import en from "@/locales/en.json";
import { acceptInvitationProblem } from "./form";

const get = (locale: unknown, key: string) =>
  key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale);

describe("acceptInvitationProblem", () => {
  it("a bad link goes back to the invitation's problem screen", () => {
    expect(acceptInvitationProblem(new Error("token_expired"))).toEqual({
      kind: "token",
      code: "token_expired",
    });
    expect(acceptInvitationProblem(new Error("token_used"))).toEqual({
      kind: "token",
      code: "token_used",
    });
  });

  it("the field the API refused is marked, including a password found in a data breach", () => {
    expect(acceptInvitationProblem(new Error("weak_password"))).toMatchObject({
      kind: "field",
      field: "password",
    });
    expect(acceptInvitationProblem(new Error("password_breached"))).toEqual({
      kind: "field",
      field: "password",
      key: "auth.validation.password_breached",
    });
    expect(acceptInvitationProblem(new Error("name_required"))).toMatchObject({
      kind: "field",
      field: "name",
    });
    expect(acceptInvitationProblem(new Error("terms_required"))).toMatchObject({
      kind: "field",
      field: "terms",
    });
  });

  it("a session acting as someone else asks to sign out first", () => {
    expect(acceptInvitationProblem(new Error("blocked_while_impersonating"))).toEqual({
      kind: "session",
    });
  });

  it("only a request that never reached the API talks about the connection", () => {
    expect(acceptInvitationProblem(new Error("network_error"))).toEqual({
      kind: "alert",
      title: "auth.errors.generic",
      body: "auth.errors.generic_help",
    });
    expect(acceptInvitationProblem(new Error("internal_error"))).toEqual({
      kind: "alert",
      title: "auth.invitation.error_title",
      body: "auth.invitation.error_body",
    });
    expect(acceptInvitationProblem(new Error("rate_limited"))).toMatchObject({
      title: "auth.errors.rate_limited",
    });
    expect(acceptInvitationProblem(new Error("account_inactive"))).toMatchObject({
      title: "auth.errors.account_inactive",
    });
  });

  it("every text it names exists in Spanish and English", () => {
    const codes = [
      "weak_password",
      "password_breached",
      "name_required",
      "terms_required",
      "account_inactive",
      "rate_limited",
      "validation_failed",
      "network_error",
      "other",
    ];
    for (const code of codes) {
      const problem = acceptInvitationProblem(new Error(code));
      const keys =
        problem.kind === "field"
          ? [problem.key]
          : problem.kind === "alert"
            ? [problem.title, problem.body]
            : [];
      for (const key of keys)
        for (const locale of [es, en]) expect(typeof get(locale, key), `${key}`).toBe("string");
    }
  });
});
