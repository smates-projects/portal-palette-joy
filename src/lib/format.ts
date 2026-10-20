import { todayIso } from "@/lib/clock";

/** Spanish for US Hispanic users: es-US. Shared by every Intl formatter in the app. */
export const localeTag = (lng: string) => (lng === "en" ? "en-US" : "es-US");
const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

export const formatDate = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(localeTag(lng), { day: "numeric", month: "short", year: "numeric" }).format(toDate(iso));

export function formatRelativeDate(iso: string, lng: string, today: string = todayIso()) {
  const days = Math.round((toDate(iso).getTime() - toDate(today).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(localeTag(lng), { numeric: "auto" }).format(days, "day");
}

/** Whole amounts without cents ("$150,000"); cents only when the amount has them. */
export const formatUsd = (amount: number, lng: string) =>
  new Intl.NumberFormat(localeTag(lng), { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);

export const formatShortDate = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(localeTag(lng), { day: "numeric", month: "short" }).format(toDate(iso));

export const formatDateTime = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(localeTag(lng), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const formatNumber = (n: number, lng: string, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(localeTag(lng), options).format(n);

export const firstName = (fullName: string) => fullName.split(" ")[0] ?? fullName;
