import { describe, expect, it } from "vitest";
import { profileViewOf } from "./profile-view";

describe("Mi perfil per role (QA M3)", () => {
  it("only a partner firm gets the firm profile and its heading", () => {
    expect(profileViewOf("partner_firm")).toEqual({ heading: "profile.heading", card: "organization", team: "organization" });
    for (const role of ["business_owner", "bishop", "sm_team", "sm_global", "franchisee"] as const) {
      expect(profileViewOf(role).heading, role).not.toBe("profile.heading");
    }
  });

  it("an owner sees the business and its team; a Bishop only his own data", () => {
    expect(profileViewOf("business_owner")).toMatchObject({ card: "business", team: "business" });
    expect(profileViewOf("bishop")).toMatchObject({ card: "person", team: "none" });
    expect(profileViewOf(undefined)).toMatchObject({ card: "person", team: "none" });
  });
});
