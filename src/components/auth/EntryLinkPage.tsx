import { useTranslation } from "react-i18next";
import { useExchangeEntryLink } from "@/lib/api/hooks";
import { SignInLinkScreen } from "./SignInLinkScreen";

/**
 * /entrada/$token: the entry link a business owner gets in his emails (he has no password until his program starts).
 * Uses it once and lands where the email pointed (`next`, the link's ?siguiente=, when it is a page of this app), else
 * on the home, which for an owner in onboarding is "Tu ingreso". Errors exactly like the magic link.
 */
export function EntryLinkPage({ token, next }: { token: string; next?: string | undefined }) {
  const { t } = useTranslation();
  const exchange = useExchangeEntryLink(token);
  return (
    <SignInLinkScreen
      exchange={exchange}
      next={next}
      title={t("auth.entry_link.title")}
      pendingLabel={t("auth.entry_link.pending")}
      expiredHelp={t("auth.entry_link.help")}
    />
  );
}
