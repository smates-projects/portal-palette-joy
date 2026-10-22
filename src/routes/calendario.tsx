import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GlobalCalendarPage, type GlobalCalendarSearch } from "@/components/global/calendar/GlobalCalendarPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/calendario")({
  validateSearch: (search: Record<string, unknown>): GlobalCalendarSearch =>
    typeof search.meeting === "string" && search.meeting ? { meeting: search.meeting } : {},
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
  component: function CalendarRoute() {
    const search = Route.useSearch();
    const role = useCurrentUser().data?.role;
    // SM Global's own screen; everyone else keeps the calendar view of Mis tareas.
    if (role && role !== "sm_global") return <Navigate to="/" />;
    return <GlobalCalendarPage search={search} />;
  },
});
