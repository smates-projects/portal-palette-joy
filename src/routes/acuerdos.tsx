import { createFileRoute } from "@tanstack/react-router";
import { AgreementsPage } from "@/components/bishop/agreements/AgreementsPage";
import { GlobalAgreementsPage } from "@/components/global/agreements/GlobalAgreementsPage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";

/** The Bishop's own agreements; for SM Global, every Bishop's framework agreement to countersign. */
function AgreementsRoute() {
  const me = useCurrentUser().data;
  return me?.role === "sm_global" ? <GlobalAgreementsPage /> : <AgreementsPage />;
}

export const Route = createFileRoute("/acuerdos")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.agreements.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.agreements.subtitle") },
      { property: "og:title", content: `${tStatic("pages.agreements.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.agreements.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgreementsRoute,
});
