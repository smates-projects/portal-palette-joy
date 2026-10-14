import { createFileRoute } from "@tanstack/react-router";
import { FranchiseeBusinessPage } from "@/components/franchisee/business/FranchiseeBusinessPage";
import { OwnerBusinessPage } from "@/components/owner/business/OwnerBusinessPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/negocio")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.business.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.business") },
      { property: "og:title", content: `${tStatic("pages.business.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.business") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessRoute,
});

/** Owners edit their business data; a franchisee sees its own unit. */
function BusinessRoute() {
  const role = useCurrentUser().data?.role;
  return role === "franchisee" ? <FranchiseeBusinessPage /> : <OwnerBusinessPage />;
}
