import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProfilePage, type CalendarReturnStatus } from "@/components/profile/ProfilePage";
import { tStatic } from "@/lib/i18n";

/** The API's Google callback comes back here with ?calendar=connected|denied|error. */
interface ProfileSearch {
  calendar?: CalendarReturnStatus;
}

const CALENDAR_STATUSES: readonly CalendarReturnStatus[] = ["connected", "denied", "error"];

export const Route = createFileRoute("/perfil")({
  validateSearch: (raw: Record<string, unknown>): ProfileSearch =>
    CALENDAR_STATUSES.includes(raw["calendar"] as CalendarReturnStatus)
      ? { calendar: raw["calendar"] as CalendarReturnStatus }
      : {},
  head: () => ({
    meta: [
      { title: `${tStatic("pages.profile.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.profile") },
      { property: "og:title", content: `${tStatic("pages.profile.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.profile") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function PerfilRoute() {
    const { calendar } = Route.useSearch();
    const navigate = useNavigate();
    return (
      <ProfilePage
        calendarStatus={calendar}
        onDismissCalendarStatus={() => void navigate({ to: "/perfil", search: {}, replace: true })}
      />
    );
  },
});
