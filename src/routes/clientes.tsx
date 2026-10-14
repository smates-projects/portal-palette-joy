import { createFileRoute } from "@tanstack/react-router";
import { ClientsPage } from "@/components/clients/ClientsPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.clients.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.clients") },
      { property: "og:title", content: `${tStatic("pages.clients.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.clients") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});
