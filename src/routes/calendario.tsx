import { createFileRoute, Navigate } from "@tanstack/react-router";
import { MyTasksPage } from "@/components/tasks/MyTasksPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";
import type { TasksSearch } from "@/lib/tasks/table";

export const Route = createFileRoute("/calendario")({
  // Only the meeting in the side panel travels in the address; the view is always the calendar.
  validateSearch: (search: Record<string, unknown>): Pick<TasksSearch, "meeting"> =>
    typeof search["meeting"] === "string" && search["meeting"] ? { meeting: search["meeting"] } : {},
  head: () => ({
    meta: [
      { title: `${tStatic("pages.calendar.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.calendar.subtitle") },
      { property: "og:title", content: `${tStatic("pages.calendar.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.calendar.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarRoute,
});

/** SM Global's Calendario: the same page as /tareas?view=calendar, with Global's data and the "Viendo" scope. */
function CalendarRoute() {
  const search = Route.useSearch();
  const role = useCurrentUser().data?.role;
  if (role && role !== "sm_global") return <Navigate to="/" />;
  return <MyTasksPage search={{ view: "calendar", meeting: search.meeting }} calendarRoute />;
}
