import { describe, expect, it } from "vitest";
import { entryMeetings, meetingIdOf } from "./meetings";

const base = {
  duration_minutes: 30,
  meet_url: "https://meet.google.com/abc",
  consultant_user_id: "nicolas",
  notes_at: null,
};
const INITIAL = {
  ...base,
  starts_at: "2026-10-14T05:44:18.724Z",
  booked_at: "2026-10-20T06:25:11.261Z",
  kind: "initial" as const,
  outcome: "held" as const,
};
const EXPANSION = {
  ...base,
  starts_at: "2026-10-14T05:12:33.249Z",
  booked_at: "2026-10-20T06:42:32.915Z",
  kind: "expansion" as const,
  outcome: null,
  duration_minutes: 60,
};

describe("entryMeetings: one selector for the meeting ids", () => {
  it("the API's lead: `meeting` is the latest of any kind and has no id; the ids come from meetings[]", () => {
    const lead = {
      meeting: EXPANSION,
      meetings: [
        { ...EXPANSION, id: "m-exp" },
        { ...INITIAL, id: "m-ini" },
      ],
    };
    const { initial, expansion } = entryMeetings(lead);
    expect(initial).toMatchObject({
      id: "m-ini",
      kind: "initial",
      outcome: "held",
      duration_minutes: 30,
    });
    expect(expansion).toMatchObject({ id: "m-exp", kind: "expansion", duration_minutes: 60 });
  });

  it("an explicit expansion_meeting wins and gets its id by its start time", () => {
    const lead = {
      meeting: INITIAL,
      expansion_meeting: EXPANSION,
      meetings: [{ ...EXPANSION, id: "m-exp", starts_at: "2026-10-14T05:12:33.249+00:00" }],
    };
    expect(meetingIdOf(entryMeetings(lead).expansion)).toBe("m-exp");
  });

  it("the owner's entry: meetings[] with duration_min and a null Meet link", () => {
    const entry = {
      meetings: [
        {
          id: "m-ini",
          kind: "initial" as const,
          starts_at: INITIAL.starts_at,
          duration_min: 30,
          meet_url: null,
          outcome: "held" as const,
          outcome_prompted_at: null,
        },
        {
          id: "m-exp",
          kind: "expansion" as const,
          starts_at: EXPANSION.starts_at,
          duration_min: 60,
          meet_url: "https://meet.google.com/x",
          outcome: null,
          outcome_prompted_at: null,
        },
      ],
    };
    const { initial, expansion } = entryMeetings(entry);
    expect(initial).toMatchObject({
      id: "m-ini",
      duration_minutes: 30,
      meet_url: "",
      outcome: "held",
    });
    expect(expansion).toMatchObject({ id: "m-exp", duration_minutes: 60, outcome: null });
  });

  it("the mock's shape (meeting without kind = initial, ids on the meetings) stays the same", () => {
    const { initial, expansion } = entryMeetings({
      meeting: { ...INITIAL, kind: undefined, id: "a" },
      expansion_meeting: null,
    });
    expect(initial).toMatchObject({ id: "a", kind: "initial" });
    expect(expansion).toBeNull();
  });

  it("after a reschedule the newest booking of a kind is the one", () => {
    const old = {
      ...INITIAL,
      id: "old",
      outcome: "reschedule" as const,
      booked_at: "2026-10-01T00:00:00Z",
    };
    const fresh = {
      ...INITIAL,
      id: "new",
      outcome: null,
      booked_at: "2026-10-05T00:00:00Z",
      starts_at: "2026-10-22T15:00:00Z",
    };
    expect(entryMeetings({ meetings: [old, fresh] }).initial?.id).toBe("new");
  });

  it("no id anywhere: the selector says so (null), the screen shows an error instead of doing nothing", () => {
    const { initial } = entryMeetings({ meeting: INITIAL });
    expect(meetingIdOf(initial)).toBeNull();
    expect(entryMeetings(null)).toEqual({ initial: null, expansion: null });
  });
});
