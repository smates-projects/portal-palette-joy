// Copy of the task detail that depends on who looks at it: the firm does the work, the owner receives it, Strategic
// Mates (and any other role) follows it. Pure, so the choice is tested without rendering.
import type { UserRole } from "../api/types";

export type TaskViewer = "firm" | "owner" | "neutral";
export type TaskEmptySection = "versions" | "requests" | "meetings";

/** Who is looking at the task detail, for its copy. */
export function taskViewer(role: UserRole | null | undefined): TaskViewer {
  if (role === "partner_firm") return "firm";
  if (role === "business_owner") return "owner";
  return "neutral";
}

const KEYS: Record<TaskViewer, Record<TaskEmptySection, string>> = {
  firm: { versions: "taskDetail.no_versions", requests: "taskDetail.requests_empty", meetings: "taskDetail.meetings_empty" },
  owner: { versions: "taskDetail.no_versions_owner", requests: "taskDetail.requests_empty_owner", meetings: "taskDetail.meetings_empty_owner" },
  neutral: { versions: "taskDetail.no_versions_neutral", requests: "taskDetail.requests_empty_neutral", meetings: "taskDetail.meetings_empty_neutral" },
};

/**
 * The empty state of a section of the task detail: the i18n key and the name it mentions. The firm reads about the
 * owner ("Cuando la envíes, Rosa la revisará aquí"), the owner about the firm ("Estudio Pérez todavía no envió…"),
 * Strategic Mates a neutral line. Without the firm's name the owner reads "la firma" (keys ending in _nofirm).
 */
export function taskEmptyState(
  role: UserRole | null | undefined,
  section: TaskEmptySection,
  names: { ownerFirst: string; firmName: string },
): { key: string; name: string } {
  const viewer = taskViewer(role);
  const key = KEYS[viewer][section];
  if (viewer === "owner") {
    const firm = names.firmName.trim();
    return firm || section === "requests" ? { key, name: firm } : { key: `${key}_nofirm`, name: "" };
  }
  return { key, name: viewer === "firm" ? names.ownerFirst : "" };
}

/**
 * Why sending a deliverable failed, in the person's words (the API's error code is the error's message): the upload
 * itself, a file refused by the check or too large, a slow check, the business out of reach, anything else. The
 * dialog shows it and stays open with the files, so the person can send again.
 */
export function deliverableErrorKey(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "upload_failed" || code === "network_error") return "taskDetail.d_error_upload";
  if (code === "file_rejected" || code === "invalid_file" || code === "file_type_not_allowed") return "taskDetail.d_error_rejected";
  if (code === "file_too_large") return "taskDetail.d_error_too_large";
  if (code === "file_verification_timeout") return "taskDetail.d_error_timeout";
  if (code === "not_found" || code === "forbidden" || code === "invalid_office") return "taskDetail.d_error_scope";
  return "taskDetail.d_error_generic";
}
