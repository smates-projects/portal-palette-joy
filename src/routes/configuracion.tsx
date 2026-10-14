import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/office/SettingsPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.settings.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.settings.subtitle") },
      { property: "og:title", content: `${tStatic("pages.settings.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.settings.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});
