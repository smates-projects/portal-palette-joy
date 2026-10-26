import { todayIso } from "@/lib/clock";

/** Spanish for US Hispanic users: es-US. Shared by every Intl formatter in the app. */
export const localeTag = (lng: string) => (lng === "en" ? "en-US" : "es-US");
const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

/**
 * Dates are written the US way in both languages (Marilyn, 21 Oct 2026: "en territorio americano es mes, día y
 * año"): 10/14/2026. The locale only decides the words around them (weekdays, relative times, numbers).
 */
const US_DATE: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit", year: "numeric" };
const US_SHORT_DATE: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit" };

/** "10/14/2026" in every language. */
export const formatDate = (iso: string, _lng: string) => new Intl.DateTimeFormat("en-US", US_DATE).format(toDate(iso));

/** "sábado 10/18/2026": a deadline day with its weekday, so it is never misread (QA B12). */
export const formatWeekdayDate = (iso: string, lng: string) =>
  `${new Intl.DateTimeFormat(localeTag(lng), { weekday: "long" }).format(toDate(iso))} ${formatDate(iso, lng)}`;

export function formatRelativeDate(iso: string, lng: string, today: string = todayIso()) {
  const days = Math.round((toDate(iso).getTime() - toDate(today).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(localeTag(lng), { numeric: "auto" }).format(days, "day");
}

/** Whole amounts without cents ("$150,000"); cents only when the amount has them. */
export const formatUsd = (amount: number, lng: string) =>
  new Intl.NumberFormat(localeTag(lng), { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);

/** "10/14", month first. */
export const formatShortDate = (iso: string, _lng: string) => new Intl.DateTimeFormat("en-US", US_SHORT_DATE).format(toDate(iso));

/** "mié 10/14, 10:00" / "Wed 10/14, 10:00 AM": the weekday in the viewer's language, the date the US way. */
export const formatDateTime = (iso: string, lng: string) => {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat(localeTag(lng), { weekday: "short" }).format(d);
  const date = new Intl.DateTimeFormat("en-US", US_SHORT_DATE).format(d);
  const time = new Intl.DateTimeFormat(localeTag(lng), { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${weekday} ${date}, ${time}`;
};

/** "10:54 p.m." in the viewer's language (the activity lines of the lead detail). */
export const formatTime = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(localeTag(lng), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const formatNumber = (n: number, lng: string, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(localeTag(lng), options).format(n);

/**
 * A sentence whose last value already ends in a period ("03:00 p.m.") keeps one: "Lo marcaste el mié 10/14, 03:00 p.m."
 * and never "p.m..".
 */
export const oneFinalPeriod = (text: string) => text.replace(/\.{2,}$/, ".");

export const firstName = (fullName: string) => fullName.split(" ")[0] ?? fullName;
