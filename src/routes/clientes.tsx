import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.clients.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.clients") },
      { property: "og:title", content: `${tStatic("pages.clients.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.clients") },
    ],
  }),
  component: () => <PageHeader pageKey="clients" />,
});
