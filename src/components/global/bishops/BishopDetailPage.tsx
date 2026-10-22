import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { useFrameworkAgreements, useLeads, useUsers } from "@/lib/api/hooks";
import type { LeadWithComputed } from "@/lib/api/types";
import { bishopRowOf } from "@/lib/bishops/status";
import { formatDate } from "@/lib/format";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { SealedCopyLinks } from "@/components/docuseal/SealedCopies";
import { secondaryBtn } from "@/components/accounts/shared";
import { BusinessSheet, ErrorBox, ListSkeleton } from "../shared";
import { MAX_HOME_ITEMS } from "../logic";
import { BishopPrimaryAction, BishopStateChip } from "./shared";

const FUNDS_TONE = {
  pending: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  partial: "border-status-info-border bg-status-info-bg text-status-info-fg",
  received: "border-status-success-border bg-status-success-bg text-status-success-fg",
} as const;

/**
 * One Bishop for SM Global: contact, the framework agreement (read it in ES or EN, download the sealed copies, sign it
 * as Corporate) and the opportunities the Bishop took, with the state of the funds and the way to the business file.
 */
export function BishopDetailPage({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const usersQ = useUsers();
  const contractsQ = useFrameworkAgreements();
  const leadsQ = useLeads();
  const [reading, setReading] = useState(false);
  const [business, setBusiness] = useState<string | null>(null);
  const [allOpps, setAllOpps] = useState(false);

  const back = (
    <Link to="/bishops" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
      <ArrowLeft className="h-4 w-4" />{t("global.bishops.back")}
    </Link>
  );
  const shell = (body: ReactNode) => <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{back}<div className="mt-4">{body}</div></div>;

  if (usersQ.isError || contractsQ.isError || leadsQ.isError)
    return shell(<ErrorBox onRetry={() => { void usersQ.refetch(); void contractsQ.refetch(); void leadsQ.refetch(); }} />);
  if (usersQ.isLoading || contractsQ.isLoading || leadsQ.isLoading) return shell(<ListSkeleton rows={3} />);

  const user = usersQ.data?.find((u) => u.id === userId && u.role === "bishop");
  if (!user) return shell(<p className="rounded-md border border-border bg-surface p-6 text-sm text-muted-foreground">{t("global.bishops.not_found")}</p>);

  const row = bishopRowOf(user, contractsQ.data ?? [], leadsQ.data ?? []);
  const c = row.contract;
  const opps = allOpps ? row.taken : row.taken.slice(0, MAX_HOME_ITEMS);

  return shell(
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("roles.bishop")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{user.full_name}</h1>
        <BishopStateChip state={row.state} />
      </div>
      {row.date && <p className="mt-1 text-sm text-muted-foreground">{t(`global.bishops.date.${row.state}`, { date: formatDate(row.date, lng) })}</p>}

      <section className="mt-6 rounded-md border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t("global.bishops.contact_title")}</h2>
        <dl className="px-4 py-3 text-sm">
          <dt className="text-xs text-muted-foreground">{t("global.bishops.email")}</dt>
          <dd className="break-all"><a href={`mailto:${user.email}`} className="text-link hover:underline">{user.email}</a></dd>
        </dl>
      </section>

      <section className="mt-4 rounded-md border border-border bg-surface" aria-labelledby="framework-title">
        <h2 id="framework-title" className="border-b border-border px-4 py-3 text-sm font-semibold">{t("global.bishops.agreement_title")}</h2>
        <div className="space-y-3 px-4 py-3 text-sm">
          {c ? (
            <>
              <p className="font-medium">{c.name}</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {c.signers.map((s) => (
                  <li key={`${s.party}-${s.name}`}>
                    {s.signed_at ? t("global.bishops.signer_signed", { name: s.name, date: formatDate(s.signed_at, lng) }) : t("global.bishops.signer_pending", { name: s.name })}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">{t("global.bishops.agreement_none")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <BishopPrimaryAction row={row} hideView />
            {c && <button className={secondaryBtn} onClick={() => setReading(true)}><FileText className="h-4 w-4" />{t("intake.docuseal.view_signed")}</button>}
            {c && <SealedCopyLinks contract={c} />}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("global.bishops.opportunities_title")}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{row.taken.length}</span>
        </div>
        {row.taken.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t("global.bishops.opportunities_empty")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {opps.map((l) => <OpportunityRow key={l.id} lead={l} lng={lng} onOpen={setBusiness} />)}
            </ul>
            {row.taken.length > MAX_HOME_ITEMS && (
              <button onClick={() => setAllOpps((v) => !v)} className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:underline">
                {allOpps ? t("global.home.see_less") : t("sm.see_all", { count: row.taken.length })}
              </button>
            )}
          </>
        )}
      </section>

      {reading && c && <SignedContractDialog contract={c} onClose={() => setReading(false)} />}
      <BusinessSheet businessId={business} onClose={() => setBusiness(null)} />
    </>,
  );
}

function OpportunityRow({ lead, lng, onOpen }: { lead: LeadWithComputed; lng: string; onOpen: (businessId: string) => void }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{lead.business.name}</p>
        {lead.bishop_accepted_at && <p className="text-xs text-muted-foreground">{t("global.bishops.taken_on", { date: formatDate(lead.bishop_accepted_at, lng) })}</p>}
      </div>
      {lead.funds ? (
        <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none ${FUNDS_TONE[lead.funds.status]}`}>
          {t(`global.bishops.funds.${lead.funds.status}`)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t("global.bishops.funds_none")}</span>
      )}
      {lead.business_id ? (
        <button className={secondaryBtn} onClick={() => onOpen(lead.business_id!)}>{t("global.bishops.view_business")}</button>
      ) : (
        <span className="text-xs text-muted-foreground sm:w-40 sm:text-right">{t("global.bishops.no_business")}</span>
      )}
    </li>
  );
}
