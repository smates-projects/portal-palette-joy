import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.home.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.home") },
      { property: "og:title", content: `${tStatic("pages.home.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.home") },
    ],
  }),
  component: () => <PageHeader pageKey="home" />,
});
