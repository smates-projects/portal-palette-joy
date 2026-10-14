import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/tareas")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.tasks.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.tasks") },
      { property: "og:title", content: `${tStatic("pages.tasks.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.tasks") },
    ],
  }),
  component: () => <PageHeader pageKey="tasks" />,
});
