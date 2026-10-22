import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCreateFrameworkAgreement, useCurrentUser, useResendInvitation } from "@/lib/api/hooks";
import type { Contract } from "@/lib/api/types";
import { primaryActionOf, type BishopRow, type BishopState } from "@/lib/bishops/status";
import { cn } from "@/lib/utils";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { primaryBtn, secondaryBtn } from "@/components/accounts/shared";

const TONE: Record<BishopState, string> = {
  awaiting_sm: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  invited: "border-status-info-border bg-status-info-bg text-status-info-fg",
  awaiting_bishop: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  no_agreement: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  active: "border-status-success-border bg-status-success-bg text-status-success-fg",
  investing: "border-status-success-border bg-surface text-status-success-fg",
};

/** Invitado, Falta tu firma, Activo, Invirtiendo (and the two rare ones): text with a visible border. */
export function BishopStateChip({ state }: { state: BishopState }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", TONE[state])}>
      {t(`global.bishops.state.${state}`)}
    </span>
  );
}

/**
 * The one action of a Bishop's state: "Reenviar invitación", "Firmar acuerdo marco" (the same signing dialog as
 * everywhere), "Crear acuerdo marco" for an older Bishop without one, or "Ver" (the detail). `hideView` leaves "Ver"
 * out where the person is already on the detail.
 */
export function BishopPrimaryAction({ row, hideView = false }: { row: BishopRow; hideView?: boolean }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const resend = useResendInvitation();
  const create = useCreateFrameworkAgreement();
  const [signing, setSigning] = useState<Contract | null>(null);
  const action = primaryActionOf(row);
  const name = row.user.full_name;

  if (action === "resend")
    return (
      <button
        className={secondaryBtn}
        disabled={resend.isPending}
        onClick={() => resend.mutate(row.user.id, { onSuccess: () => toast.success(t("global.bishops.t_resent", { name })), onError: () => toast.error(t("global.t_error")) })}
      >
        {t("global.bishops.action.resend")}
      </button>
    );
  if (action === "sign" && row.contract)
    return (
      <>
        <button className={primaryBtn} onClick={() => setSigning(row.contract)}>{t("global.bishops.action.sign")}</button>
        {signing && <DocuSealSigner contract={signing} party="sm" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      </>
    );
  if (action === "create")
    return (
      <button
        className={secondaryBtn}
        disabled={create.isPending}
        onClick={() => create.mutate(row.user.id, { onSuccess: () => toast.success(t("global.bishops.t_created", { name })), onError: () => toast.error(t("global.t_error")) })}
      >
        {t("global.bishops.action.create")}
      </button>
    );
  if (hideView) return null;
  return (
    <Link to="/bishops/$userId" params={{ userId: row.user.id }} className={secondaryBtn}>
      {t("global.bishops.action.view")}
    </Link>
  );
}
