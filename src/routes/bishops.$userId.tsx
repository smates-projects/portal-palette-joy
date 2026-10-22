import { createFileRoute, Navigate } from "@tanstack/react-router";
import { BishopDetailPage } from "@/components/global/bishops/BishopDetailPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/bishops/$userId")({
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
  component: function BishopDetailRoute() {
    const { userId } = Route.useParams();
    const role = useCurrentUser().data?.role;
    if (role && role !== "sm_global") return <Navigate to="/" />;
    return <BishopDetailPage userId={userId} />;
  },
});
