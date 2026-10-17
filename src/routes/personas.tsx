import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PeoplePage } from "@/components/global/people/PeoplePage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/personas")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.people.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.people.subtitle") },
      { property: "og:title", content: `${tStatic("pages.people.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.people.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function PersonasRoute() {
    const role = useCurrentUser().data?.role;
    // Only SM Global manages the whole network; an office manages its people in Catálogo y equipo.
    if (role && role !== "sm_global") return <Navigate to="/" />;
    return <PeoplePage />;
  },
});
