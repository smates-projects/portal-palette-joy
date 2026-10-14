import { createFileRoute } from "@tanstack/react-router";
import { FranchiseeManualPage } from "@/components/franchisee/manual/FranchiseeManualPage";
import { OwnerManualPage } from "@/components/owner/manual/OwnerManualPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.manual.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.manual") },
      { property: "og:title", content: `${tStatic("pages.manual.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.manual") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManualRoute,
});

/** Owners (in program or franchisor) see their own manual; a franchisee reads its franchisor manual. */
function ManualRoute() {
  const role = useCurrentUser().data?.role;
  return role === "franchisee" ? <FranchiseeManualPage /> : <OwnerManualPage />;
}
