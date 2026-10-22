import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GlobalAgreementsPage } from "@/components/global/agreements/GlobalAgreementsPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/bishops/")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.bishops.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.bishops.subtitle") },
      { property: "og:title", content: `${tStatic("pages.bishops.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.bishops.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function BishopsRoute() {
    const role = useCurrentUser().data?.role;
    // Only SM Global manages the Bishops: they talk to headquarters, never to an office.
    if (role && role !== "sm_global") return <Navigate to="/" />;
    return <GlobalAgreementsPage />;
  },
});
