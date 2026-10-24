import { createFileRoute } from "@tanstack/react-router";
import { SealedCopyPage } from "@/components/docuseal/SealedCopies";
import type { ContractLanguage } from "@/lib/api/types";
import { isContractLanguage } from "@/lib/contracts/language";
import { tStatic } from "@/lib/i18n";

/** ?copia=es|en: the sealed copy the "Contrato firmado" email asked for (Spanish when missing or unknown). */
interface SealedCopySearch {
  copia: ContractLanguage;
}

export const Route = createFileRoute("/contratos/$contractId")({
  validateSearch: (raw: Record<string, unknown>): SealedCopySearch => ({
    copia: isContractLanguage(raw["copia"]) ? raw["copia"] : "es",
  }),
  head: () => ({
    meta: [
      { title: `${tStatic("contracts_lang.copy_page_title")} · SM Platform` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SealedCopyRoute,
});

function SealedCopyRoute() {
  const { contractId } = Route.useParams();
  const { copia } = Route.useSearch();
  return <SealedCopyPage contractId={contractId} language={copia} />;
}
