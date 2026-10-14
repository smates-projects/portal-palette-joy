import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.profile.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.profile") },
      { property: "og:title", content: `${tStatic("pages.profile.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.profile") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});
