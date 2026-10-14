import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "@/components/franchisee/payments/PaymentsPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/pagos")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.payments.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.payments.subtitle") },
      { property: "og:title", content: `${tStatic("pages.payments.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.payments.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});
