// The one line of a notification in the bell. The API renders `title` itself (in Spanish): it wins in Spanish. The
// locale texts are the fallback and the English, with every name filled: a missing business or contract takes a
// shorter sentence (never ". Firmaron el" or "de " with nothing after), a missing person a plain fallback.
import type { AppNotification } from "@/lib/api/types";
import { firstName, formatDateTime } from "@/lib/format";

const isSpanish = (language: string) => language.toLowerCase().startsWith("es");

export function notificationText(n: AppNotification, translate: (key: string, values: Record<string, string>) => string, i18n: { language: string; exists: (key: string) => boolean }): string {
  const t = (key: string, values: Record<string, string> = {}) => translate(key, values);
  const apiTitle = n.title?.trim();
  if (apiTitle && isSpanish(i18n.language)) return apiTitle;
  const business = n.business_name?.trim() ?? "";
  const place = n.lead_place?.trim() ?? "";
  const contract = n.contract_name?.trim() || t(business ? "notifications.contract_fallback" : "notifications.framework_fallback");
  const values = {
    name: n.actor_name ? firstName(n.actor_name) : t("notifications.actor_fallback"),
    owner: n.actor_name?.trim() || t("notifications.owner_fallback"),
    business, business_name: business, place,
    date: n.meeting_at ? formatDateTime(n.meeting_at, i18n.language) : "",
    contract_name: contract,
  };
  // A sentence built around the business (or the place) has a shorter form for when it is missing.
  const short = `notifications.kind_${n.kind}_short`;
  const missing = (!business && SUBJECT_BUSINESS.has(n.kind)) || (!place && SUBJECT_PLACE.has(n.kind)) || (!values.date && SUBJECT_DATE.has(n.kind));
  if (missing && i18n.exists(short)) return t(short, values);
  return t(`notifications.kind_${n.kind}`, values);
}

/**
 * The label of a preference row in Mi perfil > Notificaciones (QA M5). A kind the API added before the front knows it
 * never shows a raw key: it reads as its words ("contract_due_soon" -> "Contract due soon") under a generic prefix.
 */
export function preferenceLabel(
  kind: string,
  translate: (key: string, values?: Record<string, string>) => string,
  exists: (key: string) => boolean,
): string {
  const key = `notifications.pref_${kind}`;
  if (exists(key)) return translate(key);
  const words = kind.replace(/[_-]+/g, " ").trim();
  return translate("notifications.pref_unknown", { kind: words.charAt(0).toUpperCase() + words.slice(1) });
}

/** Kinds whose sentence names the business. */
const SUBJECT_BUSINESS: ReadonlySet<string> = new Set([
  "contract_signed", "contract_sent", "signature_pending_review", "document_received", "document_requested", "documents_approved",
  "documents_unlocked", "review_overdue", "program_started", "binding_ready", "validation_closed", "brand_logo_rejected",
  "meeting_outcome_pending", "lead_assessment", "transfer_received", "lead_auto_discarded",
  "contract_due_soon", "owner_nda_received", "document_not_applicable",
]);
/** Kinds whose sentence names the place. */
const SUBJECT_PLACE: ReadonlySet<string> = new Set(["opportunity_presented"]);
/** Kinds whose sentence names the meeting date. */
const SUBJECT_DATE: ReadonlySet<string> = new Set(["meeting_booked", "meeting_scheduled", "meeting_moved", "meeting_cancelled"]);
