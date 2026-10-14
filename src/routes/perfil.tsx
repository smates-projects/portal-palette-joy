import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.profile.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.profile") },
      { property: "og:title", content: `${tStatic("pages.profile.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.profile") },
    ],
  }),
  component: () => <PageHeader pageKey="profile" />,
});
