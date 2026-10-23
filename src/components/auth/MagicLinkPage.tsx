import { useTranslation } from "react-i18next";
import { useExchangeMagicLink, useLinkLifetimes } from "@/lib/api/hooks";
import { SignInLinkScreen } from "./SignInLinkScreen";

/** /enlace/$token: uses the magic link as soon as the page opens, then goes home. On error, says why and offers a new one. */
export function MagicLinkPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const exchange = useExchangeMagicLink(token);
  const minutes = useLinkLifetimes().data?.magic_link_minutes;
  return (
    <SignInLinkScreen
      exchange={exchange}
      title={t("auth.magic.title")}
      pendingLabel={t("auth.magic_exchange.pending")}
      expiredHelp={t("auth.magic_exchange.help", { minutes: minutes ?? "…" })}
    />
  );
}
