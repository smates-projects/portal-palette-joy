import { createFileRoute } from "@tanstack/react-router";
import { OfficeDetailPage } from "@/components/global/offices/OfficeDetailPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/oficinas/$officeId")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.offices.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.offices.subtitle") },
      { property: "og:title", content: `${tStatic("pages.offices.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.offices.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function DetailRoute() {
    const { officeId } = Route.useParams();
    return <OfficeDetailPage officeId={officeId} />;
  },
});
