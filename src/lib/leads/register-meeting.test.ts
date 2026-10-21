import { describe, expect, it } from "vitest";
import { emptyRegisterMeetingForm, toRegisterMeetingInput, validateRegisterMeeting } from "./register-meeting";

describe("Registrar reunión form", () => {
  it("needs a date and a time; the Meet link is optional but must be a URL", () => {
    expect(validateRegisterMeeting(emptyRegisterMeetingForm())).toEqual({ date: "date_required", time: "time_required" });
    expect(validateRegisterMeeting({ date: "2026-10-22", time: "14:30", duration_minutes: 30, meet_url: "" })).toEqual({});
    expect(validateRegisterMeeting({ date: "2026-10-22", time: "14:30", duration_minutes: 30, meet_url: "meet.google.com/abc" })).toEqual({ meet_url: "invalid_url" });
    expect(validateRegisterMeeting({ date: "2026-10-22", time: "14:30", duration_minutes: 0, meet_url: "" })).toEqual({ duration_minutes: "invalid_duration" });
  });

  it("builds the API input as an ISO instant from the local date and time, with a null link when empty", () => {
    const input = toRegisterMeetingInput({ date: "2026-10-22", time: "14:30", duration_minutes: 45, meet_url: "  " });
    expect(input.duration_minutes).toBe(45);
    expect(input.meet_url).toBeNull();
    expect(new Date(input.starts_at).getTime()).toBe(new Date("2026-10-22T14:30:00").getTime());
    expect(toRegisterMeetingInput({ date: "2026-10-22", time: "09:00", duration_minutes: 30, meet_url: "https://meet.google.com/abc-defg-hij" }).meet_url).toBe("https://meet.google.com/abc-defg-hij");
  });
});
