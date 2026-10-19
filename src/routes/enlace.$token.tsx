import { createFileRoute } from "@tanstack/react-router";
import { MagicLinkPage } from "@/components/auth/MagicLinkPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/enlace/$token")({
  head: () => ({
    meta: [
      { title: `${tStatic("auth.magic.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: MagicLinkRoute,
});

function MagicLinkRoute() {
  const { token } = Route.useParams();
  return <MagicLinkPage token={token} />;
}
