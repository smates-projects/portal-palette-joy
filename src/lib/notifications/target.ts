// Where a notification of the bell takes each person. Pure: the bell calls it with the notification and the role of
// the person who reads it, and navigates to the answer (after marking the notification read).
import type { AppNotification, UserRole } from "@/lib/api/types";
import type { OwnerStepKey } from "@/lib/leads/entry-flow";

export type NotificationTarget =
  | { to: "/tareas"; search: { view: "calendar"; meeting: string } }
  | { to: "/tareas"; search: { task: string } }
  | { to: "/perfil" }
  | { to: "/embudo"; search: { lead: string; focus?: "meeting" } }
  | { to: "/"; search: { step?: OwnerStepKey } }
  | { to: "/oportunidades" }
  | { to: "/oportunidades/$opportunityId"; params: { opportunityId: string } }
  | { to: "/acuerdos" }
  | { to: "/bishops" }
  | { to: "/negocios"; search: { biz: string } };

/** Fields the rule reads. `kind` is a plain string: the API also sends kinds the front has no text for yet. */
export type NotificationLike = Pick<AppNotification, "task_id" | "business_id"> & {
  kind: string;
  lead_id?: string | null | undefined;
  meeting_id?: string | null | undefined;
  opportunity_id?: string | null | undefined;
};

/** Calendar v2: these open the calendar with the meeting in focus. */
const MEETING_KINDS: ReadonlySet<string> = new Set(["meeting_scheduled", "meeting_moved", "meeting_cancelled"]);
/** These open Mi perfil, on the Google Calendar card. */
const PROFILE_KINDS: ReadonlySet<string> = new Set(["calendar_disconnected", "calendar_connect_suggested", "calendar_reconnect_required"]);
/** A contract to sign, signed by someone else or close to its deadline: it opens where this person signs it. */
const CONTRACT_KINDS: ReadonlySet<string> = new Set(["contract_sent", "contract_signed", "contract_due_soon", "binding_ready", "signature_pending_review", "mou_ready"]);

/** The step of the owner's "Tu ingreso" each entry notice is about (none: the screen shows the current step). */
const OWNER_STEP: Readonly<Record<string, OwnerStepKey>> = {
  mou_ready: "mou",
  binding_ready: "binding",
  validation_closed: "operating_agreement",
  documents_unlocked: "documents",
  document_requested: "documents",
};

const home = (step?: OwnerStepKey): NotificationTarget => ({ to: "/", search: step ? { step } : {} });
const opportunityOf = (n: NotificationLike): NotificationTarget =>
  n.opportunity_id ? { to: "/oportunidades/$opportunityId", params: { opportunityId: n.opportunity_id } } : { to: "/oportunidades" };

export function notificationTarget(n: NotificationLike, role: UserRole | undefined): NotificationTarget {
  if (MEETING_KINDS.has(n.kind) && n.meeting_id) return { to: "/tareas", search: { view: "calendar", meeting: n.meeting_id } };
  if (PROFILE_KINDS.has(n.kind)) return { to: "/perfil" };

  // A Business Bishop signs every agreement (framework, binding, tripartite) in Acuerdos and reads an opportunity in
  // Oportunidades; he has no funnel.
  if (role === "bishop") {
    if (n.kind === "opportunity_presented" || n.kind === "opportunity_available") return opportunityOf(n);
    if (CONTRACT_KINDS.has(n.kind)) return { to: "/acuerdos" };
    if (n.opportunity_id) return opportunityOf(n);
    return n.task_id ? { to: "/tareas", search: { task: n.task_id } } : home();
  }

  // The owner signs and uploads from "Tu ingreso" (Inicio), on the step the notice is about.
  if (role === "business_owner") {
    if (CONTRACT_KINDS.has(n.kind) || n.kind in OWNER_STEP || n.lead_id) return home(OWNER_STEP[n.kind]);
    return n.task_id ? { to: "/tareas", search: { task: n.task_id } } : home();
  }

  // Strategic Mates (an office or SM Global): anything about a lead opens it in the Embudo, where SM signs for
  // Strategic Mates; "Resultado de la reunión pendiente" with its meeting card in focus.
  if (n.lead_id) return { to: "/embudo", search: n.kind === "meeting_outcome_pending" ? { lead: n.lead_id, focus: "meeting" } : { lead: n.lead_id } };
  // A contract without a lead is a Bishop's framework agreement: SM Global countersigns it in Bishops.
  if (CONTRACT_KINDS.has(n.kind) && role === "sm_global") return { to: "/bishops" };
  if (n.kind === "brand_logo_rejected" && !n.task_id && n.business_id) return { to: "/negocios", search: { biz: n.business_id } };
  // Program start and the rest about a business, not a task: the home of each role picks it up.
  return n.task_id ? { to: "/tareas", search: { task: n.task_id } } : home();
}
