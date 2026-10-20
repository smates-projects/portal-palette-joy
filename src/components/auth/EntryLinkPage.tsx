import { useTranslation } from "react-i18next";
import { useExchangeEntryLink } from "@/lib/api/hooks";
import { SignInLinkScreen } from "./SignInLinkScreen";

/**
 * /entrada/$token: the entry link a business owner gets when the meeting is booked. Uses it once and lands on the
 * home, which for an owner in onboarding is "Tu ingreso". Errors exactly like the magic link.
 */
export function EntryLinkPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const exchange = useExchangeEntryLink(token);
  return (
    <SignInLinkScreen
      exchange={exchange}
      title={t("auth.entry_link.title")}
      pendingLabel={t("auth.entry_link.pending")}
      expiredHelp={t("auth.entry_link.help")}
    />
  );
}
