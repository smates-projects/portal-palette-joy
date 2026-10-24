import { describe, expect, it } from "vitest";
import { leadMeetingPeople, leadOwnerOf, scheduleRoute } from "./scheduling";

const users = [
  { id: "n", role: "sm_team" as const, business_id: null, email: "nicolas@strategicmates.com" },
  {
    id: "lu",
    role: "business_owner" as const,
    business_id: "peralta",
    email: "lucia@peraltapisos.com",
  },
  { id: "x", role: "business_owner" as const, business_id: "other", email: "x@other.com" },
];

describe("Agendar reunión on a lead", () => {
  it("finds the owner's account by the lead's business, or by its email before the business is linked", () => {
    expect(
      leadOwnerOf({ business_id: "peralta", contact: { email: "otro@mail.com" } }, users)?.id,
    ).toBe("lu");
    expect(
      leadOwnerOf({ business_id: null, contact: { email: " Lucia@PeraltaPisos.com " } }, users)?.id,
    ).toBe("lu");
    expect(
      leadOwnerOf({ business_id: null, contact: { email: "nadie@mail.com" } }, users),
    ).toBeUndefined();
    expect(
      leadOwnerOf({ business_id: "peralta", contact: { email: "" } }, undefined),
    ).toBeUndefined();
  });

  it("with an account the portal's dialog books it; without one, the booking link", () => {
    expect(scheduleRoute("schedule", true)).toBe("dialog");
    expect(scheduleRoute("rebook", true)).toBe("dialog");
    expect(scheduleRoute("schedule", false)).toBe("booking_link");
    expect(scheduleRoute("rebook", false)).toBe("booking_link");
    expect(scheduleRoute("send_mou", true)).toBeNull();
  });

  it("the expansion meeting of an accepted lead starts with the Bishop who accepted it and the owner", () => {
    const owner = { id: "lu", full_name: "Lucía Peralta" };
    const bishop = { user_id: "b1", name: "Pedro Bishop" };
    expect(leadMeetingPeople({ stage: "accepted" }, owner, bishop)).toEqual([
      { user_id: "b1", name: "Pedro Bishop" },
      { user_id: "lu", name: "Lucía Peralta" },
    ]);
    expect(leadMeetingPeople({ stage: "accepted" }, undefined, null)).toEqual([]);
    // Before that the prospect is invited by email: nobody is pre-filled.
    expect(leadMeetingPeople({ stage: "meeting" }, owner, bishop)).toEqual([]);
  });
});
