import { TODAY } from "@/config/app";

const localeTag = (lng: string) => (lng === "en" ? "en-US" : "es-AR");
const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);

export const formatDate = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(localeTag(lng), { day: "numeric", month: "short", year: "numeric" }).format(toDate(iso));

export function formatRelativeDate(iso: string, lng: string, today: string = TODAY) {
  const days = Math.round((toDate(iso).getTime() - toDate(today).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(localeTag(lng), { numeric: "auto" }).format(days, "day");
}

export const formatUsd = (amount: number, lng: string) =>
  new Intl.NumberFormat(localeTag(lng), { style: "currency", currency: "USD" }).format(amount);
