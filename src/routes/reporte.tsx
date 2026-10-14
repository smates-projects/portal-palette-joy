import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/report/ReportPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/reporte")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.report.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.report") },
      { property: "og:title", content: `${tStatic("pages.report.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.report") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});
