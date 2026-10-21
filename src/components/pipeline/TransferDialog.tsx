import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useOrganizations, useUsers } from "@/lib/api/hooks";
import type { TransferInput } from "@/lib/api/repositories";
import type { Organization, User } from "@/lib/api/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

/** "Derivar a oficina" is for SM Global and the admin of the office the lead or business is in. */
export const canTransfer = (me: Pick<User, "role" | "is_admin" | "organization_id"> | undefined, officeId: string) =>
  !!me && (me.role === "sm_global" || (me.role === "sm_team" && !!me.is_admin && me.organization_id === officeId));

/** Who can follow a lead or business of an office: its SM team, or anyone of SM Global (any office). */
export const canFollowOffice = (u: Pick<User, "role" | "organization_id" | "status">, officeId: string) =>
  u.status !== "inactive" && (u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === officeId));

/** Offices a lead or business can be moved to: every SM office plus Corporate, never the current one. */
export const transferTargets = (orgs: Organization[], currentOfficeId: string) =>
  orgs.filter((o) => (o.kind === "sm" || o.kind === "sm_global") && o.id !== currentOfficeId && o.status !== "paused");

/**
 * "Derivar a oficina": the target office and the person who follows it there (the SM team of that office plus
 * anyone of SM Global). Nothing is sent until both are chosen; the confirmation is the primary button.
 * `consultantOptional` (businesses): without one the API picks who follows it in the target office.
 */
export function TransferDialog(props: {
  name: string;
  currentOfficeId: string;
  pending: boolean;
  consultantOptional?: boolean;
  onClose: () => void;
  onConfirm: (input: TransferInput, labels: { office: string; consultant: string }) => void;
}) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const orgs = useOrganizations().data ?? [];
  const users = useUsers().data ?? [];
  const [officeId, setOfficeId] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [tried, setTried] = useState(false);
  const offices = transferTargets(orgs, props.currentOfficeId);
  const officeLabel = (o: Organization) => (o.kind === "sm_global" ? t("topbar.viewing_corporate") : o.name);
  const people = officeId ? users.filter((u) => canFollowOffice(u, officeId)) : [];
  const office = offices.find((o) => o.id === officeId);
  const consultant = people.find((u) => u.id === consultantId);
  const officeError = tried && !office;
  const consultantError = tried && !props.consultantOptional && !consultant;
  const submit = () => {
    setTried(true);
    if (!office || (!props.consultantOptional && !consultant)) return;
    props.onConfirm(
      { office_id: office.id, consultant_user_id: consultant?.id ?? null },
      { office: officeLabel(office), consultant: consultant?.full_name ?? "" },
    );
  };
  const placeholder = me?.role === "sm_global" ? t("pipeline.transfer.consultant") : t("pipeline.transfer.consultant");
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.transfer.title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t("pipeline.transfer.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("pipeline.transfer.office")}</span>
            <Select value={officeId} onValueChange={(v) => { setOfficeId(v); setConsultantId(""); }}>
              <SelectTrigger aria-label={t("pipeline.transfer.office")} aria-invalid={officeError} className={officeError ? "border-status-danger-fg bg-surface" : "bg-surface"}>
                <SelectValue placeholder={t("pipeline.transfer.office")} />
              </SelectTrigger>
              <SelectContent>
                {offices.map((o) => <SelectItem key={o.id} value={o.id}>{officeLabel(o)}</SelectItem>)}
              </SelectContent>
            </Select>
            {officeError && <span className="block text-xs text-status-danger-fg">{t("pipeline.transfer.office_required")}</span>}
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("pipeline.transfer.consultant")}</span>
            <Select value={consultantId} onValueChange={setConsultantId} disabled={!officeId}>
              <SelectTrigger aria-label={t("pipeline.transfer.consultant")} aria-invalid={consultantError} className={consultantError ? "border-status-danger-fg bg-surface" : "bg-surface"}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {people.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}{u.role === "sm_global" ? ` (${t("topbar.role_global")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-xs text-muted-foreground">{t("pipeline.transfer.consultant_hint")}</span>
            {consultantError && <span className="block text-xs text-status-danger-fg">{t("pipeline.transfer.consultant_required")}</span>}
          </label>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("pipeline.transfer.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
