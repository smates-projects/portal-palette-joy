import { createFileRoute } from "@tanstack/react-router";
import { InvitationPage } from "@/components/auth/InvitationPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/invitacion/$token")({
  head: () => ({
    meta: [
      { title: `${tStatic("auth.invitation.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: InvitationRoute,
});

function InvitationRoute() {
  const { token } = Route.useParams();
  return <InvitationPage token={token} />;
}
