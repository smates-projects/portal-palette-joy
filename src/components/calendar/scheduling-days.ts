import type { SlotDay } from "@/lib/calendar/slots";

/**
 * Days with free slots, as availability returns them. The API already keeps only the rule's weekdays
 * (meeting_hours.weekdays) inside its availability_days window: nothing is filtered, extended or cut here.
 */
export function schedulingDays(days: SlotDay[]): SlotDay[] {
  return days.filter(({ slots }) => slots.length > 0);
}
