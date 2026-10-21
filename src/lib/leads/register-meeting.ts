// "Registrar reunión": the form SM fills for a meeting agreed by hand, and the input the API takes.
import type { RegisterMeetingInput } from "@/lib/api/types";

export interface RegisterMeetingForm {
  /** YYYY-MM-DD, as the date input gives it. */
  date: string;
  /** HH:MM, as the time input gives it (local time of the person). */
  time: string;
  duration_minutes: number;
  meet_url: string;
}

export const MEETING_DURATION_CHOICES = [30, 45, 60, 90] as const;

export type RegisterMeetingError = "date_required" | "time_required" | "invalid_duration" | "invalid_url";
export type RegisterMeetingErrors = Partial<Record<keyof RegisterMeetingForm, RegisterMeetingError>>;

export const emptyRegisterMeetingForm = (): RegisterMeetingForm => ({ date: "", time: "", duration_minutes: 30, meet_url: "" });

export function validateRegisterMeeting(form: RegisterMeetingForm): RegisterMeetingErrors {
  const errors: RegisterMeetingErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(`${form.date}T12:00:00Z`))) errors.date = "date_required";
  if (!/^\d{2}:\d{2}$/.test(form.time)) errors.time = "time_required";
  if (!Number.isInteger(form.duration_minutes) || form.duration_minutes <= 0) errors.duration_minutes = "invalid_duration";
  const url = form.meet_url.trim();
  if (url && !/^https?:\/\/\S+\.\S+/.test(url)) errors.meet_url = "invalid_url";
  return errors;
}

/**
 * The API input: the date and time typed, read in the person's own time zone, as an ISO instant. The Meet link
 * travels only when there is one.
 */
export function toRegisterMeetingInput(form: RegisterMeetingForm): RegisterMeetingInput {
  const starts = new Date(`${form.date}T${form.time}:00`);
  return {
    starts_at: starts.toISOString(),
    duration_minutes: form.duration_minutes,
    meet_url: form.meet_url.trim() || null,
  };
}
