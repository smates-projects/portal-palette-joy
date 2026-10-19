import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/components/auth/ForgotPasswordPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/recuperar")({
  head: () => ({
    meta: [
      { title: `${tStatic("auth.forgot.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});
