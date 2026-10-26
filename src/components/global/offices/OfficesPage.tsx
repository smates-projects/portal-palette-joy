import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { useCreateOffice, useCurrentUser, useMySignature, useOffices, useOrganizations, useRules, useUsers } from "@/lib/api/hooks";
import { smEntitiesOf } from "@/lib/leads/contract-rules";
import { ALL_OFFICES, inOfficeScope, useOfficeScope } from "@/lib/office-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { officeHealth } from "../logic";
import { EmptyBox, ErrorBox, GlobalHeader, HealthBadge, OfficeStatusBadge } from "../shared";
import { NewOfficeDialog } from "./OfficeDialogs";
import { OfficeSignatureSection } from "./OfficeSignatureSection";

const COLUMNS = ["city", "manager", "status", "opened", "programs", "leads", "conversion", "ready", "firms", "health"] as const;

/** Oficinas: the network of SM offices, one row each. A click opens the office. */
export function OfficesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const officesQ = useOffices();
  const [scope] = useOfficeScope();
  const create = useCreateOffice();
  const [creating, setCreating] = useState(false);
  // Corporate (the sm_global organization) signs the NDA, the MOU and the binding agreement through the person the
  // rules name (sm_entities.corporate.signer_user_id), under the company name the rules set.
  const corporate = useOrganizations().data?.find((o) => o.kind === "sm_global");
  const entities = smEntitiesOf(useRules().data);
  const signerId = entities.corporate.signer_user_id;
  const ceoName = useUsers().data?.find((u) => u.id === signerId)?.full_name ?? null;
  // The API pre-signs with the signer's own saved signature (Mi perfil) before the uploaded one. Only that person can
  // read it, so when she is the one looking and has it saved, the upload folds into an optional backup.
  const me = useCurrentUser().data;
  const isSigner = !!me && !!signerId && me.id === signerId;
  const savedQ = useMySignature(isSigner);
  const savedBy = isSigner && savedQ.data ? (me?.full_name ?? null) : null;
  const header = <GlobalHeader question={t("global.offices.question")} />;
  const open = (officeId: string) => void navigate({ to: "/oficinas/$officeId", params: { officeId } });

  if (officesQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => void officesQ.refetch()} /></div>
      </div>
    );

  // "Viendo" in the header narrows the table to the office in view.
  const offices = (officesQ.data ?? []).filter((o) => inOfficeScope(scope, o.office.id));
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>{header}</div>
        <PrimaryButton onClick={() => setCreating(true)}>{t("global.offices.new")}</PrimaryButton>
      </div>

      <div className="mt-6">
        {officesQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
        ) : offices.length === 0 ? (
          <EmptyBox title={t("global.offices.empty_title")} body={t("global.offices.empty_body")} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{t("global.offices.col_office")}</th>
                  {COLUMNS.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium" title={c === "conversion" ? t("global.offices.col_conversion_hint") : undefined}>
                      {t(`global.offices.col_${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offices.map(({ office, manager, stats }) => (
                  <tr
                    key={office.id}
                    tabIndex={0}
                    onClick={() => open(office.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(office.id); } }}
                    className="cursor-pointer outline-none hover:bg-accent/40 focus-visible:bg-accent"
                  >
                    <td className="px-3 py-2.5 font-medium">{office.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{office.city}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{manager?.full_name ?? t("global.offices.no_manager")}</td>
                    <td className="px-3 py-2.5">{office.status ? <OfficeStatusBadge status={office.status} /> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{office.opened_at ? formatDate(office.opened_at, i18n.language) : t("global.offices.no_date")}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.programs}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.leads_this_month}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-display tabular-nums">
                      {stats.conversion_month === null ? <span className="font-sans text-xs text-muted-foreground">{t("global.offices.no_conversion")}</span> : `${stats.conversion_month}%`}
                    </td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.ready_to_franchise}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.partner_firms}</td>
                    <td className="px-3 py-2.5">{stats.programs > 0 ? <HealthBadge health={officeHealth(stats.health)} /> : <span className="text-xs text-muted-foreground">{t("global.offices.no_programs")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {corporate && scope === ALL_OFFICES && (
        <div className="mt-2">
          <OfficeSignatureSection
            office={corporate}
            title={t("global.offices.corporate_signature.title", { entity: entities.corporate.name })}
            hint={
              savedBy
                ? t("global.offices.corporate_signature.backup_hint", { name: savedBy })
                : ceoName
                  ? t("global.offices.corporate_signature.hint_named", { name: ceoName, entity: entities.corporate.name })
                  : t("global.offices.corporate_signature.hint", { entity: entities.corporate.name })
            }
            collapsed={
              savedBy
                ? { line: t("global.offices.corporate_signature.uses_saved", { name: savedBy }), expandLabel: t("global.offices.corporate_signature.upload_backup") }
                : undefined
            }
          />
        </div>
      )}

      {creating && (
        <NewOfficeDialog
          pending={create.isPending}
          onClose={() => setCreating(false)}
          onCreate={(input) =>
            create.mutate(input, {
              onSuccess: (summary) => {
                setCreating(false);
                toast.success(t("global.offices.t_created", { name: summary.office.name }));
                open(summary.office.id);
              },
              onError: (error) => toast.error(t(`global.offices.new_form.api_${error.message}`, { defaultValue: t("global.t_error") })),
            })
          }
        />
      )}
    </div>
  );
}
