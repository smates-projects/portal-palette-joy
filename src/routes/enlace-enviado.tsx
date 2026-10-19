import { createFileRoute } from "@tanstack/react-router";
import { MagicLinkSentPage } from "@/components/auth/MagicLinkSentPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/enlace-enviado")({
  head: () => ({
    meta: [
      { title: `${tStatic("auth.sent.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MagicLinkSentPage,
});
