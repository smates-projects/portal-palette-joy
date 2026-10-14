import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "@/components/global/rules/RulesPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.rules.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.rules.subtitle") },
      { property: "og:title", content: `${tStatic("pages.rules.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.rules.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});
