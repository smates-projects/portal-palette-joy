import { createFileRoute } from "@tanstack/react-router";
import { OwnerNumbersPage } from "@/components/owner/numbers/OwnerNumbersPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/numeros")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.numbers.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.numbers") },
      { property: "og:title", content: `${tStatic("pages.numbers.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.numbers") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerNumbersPage,
});
