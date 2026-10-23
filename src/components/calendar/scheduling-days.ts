import type { SlotDay } from "@/lib/calendar/slots";

/** Display only working days returned by availability; never extend or recompute the API window. */
export function schedulingDays(days: SlotDay[]): SlotDay[] {
  return days.filter(({ day, slots }) => {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return weekday !== 0 && weekday !== 6 && slots.length > 0;
  }).slice(0, 14);
}