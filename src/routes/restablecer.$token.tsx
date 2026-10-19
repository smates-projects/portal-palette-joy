import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/auth/ResetPasswordPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/restablecer/$token")({
  head: () => ({
    meta: [
      { title: `${tStatic("auth.reset.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token } = Route.useParams();
  return <ResetPasswordPage token={token} />;
}
