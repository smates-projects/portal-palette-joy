import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useContracts, useCurrentUser, useDocuments, useIntake } from "@/lib/api/hooks";
import type { Contract } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { ErrorState, LoadingState, PageHeader } from "../shared";

/** "Tu ingreso": what the owner still has to do before the program starts. One highlighted step at a time. */
export function IntakeHomePage() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const intakeQ = useIntake();
  const contractsQ = useContracts();
  const docsQ = useDocuments();
  const [signing, setSigning] = useState<Contract | null>(null);
  const queries = [intakeQ, contractsQ, docsQ];

  if (queries.some((q) => q.isError)) return <Wrap><ErrorState onRetry={() => queries.forEach((q) => void q.refetch())} /></Wrap>;
  if (queries.some((q) => q.isLoading) || !intakeQ.data) return <Wrap><LoadingState rows={3} /></Wrap>;

  const s = intakeQ.data;
  const toSign = (contractsQ.data ?? []).filter((c) => c.area === "intake" && c.signers.some((x) => x.party === "owner" && (x.status === "sent" || x.status === "opened")));
  const missing = (docsQ.data ?? []).filter((d) => d.area === "intake" && (d.state === "requested" || d.state === "rejected")).length;
  const current = toSign.length > 0 ? 1 : missing > 0 ? 2 : !s.approved_at ? 3 : 4;

  const steps = [
    { n: 1, title: t("intake.owner.s1_title"), body: t("intake.owner.s1_body"),
      cta: toSign.map((c) => <button key={c.id} onClick={() => setSigning(c)} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("intake.owner.s1_cta", { name: c.name })}</button>) },
    { n: 2, title: t("intake.owner.s2_title"), body: t("intake.owner.s2_body", { count: missing }),
      cta: <Link to="/documentos" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t("intake.owner.s2_cta")}</Link> },
    { n: 3, title: t("intake.owner.s3_title", { day: Math.max(s.clock.day, 1), total: s.clock.total }), body: s.clock.status === "paused" ? t("intake.owner.s3_paused") : t("intake.owner.s3_body"), cta: null },
    { n: 4, title: t("intake.owner.s4_title"), body: t("intake.owner.s4_body"), cta: null },
  ];

  return (
    <Wrap>
      <ol className="mt-6 space-y-3">
        {steps.map((st) => {
          const done = st.n < current;
          const active = st.n === current;
          return (
            <li key={st.n} className={cn("rounded-md border bg-surface p-4", active ? "border-primary shadow-sm" : "border-border", !active && "opacity-70")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {done ? <Check className="h-4 w-4 text-status-success-fg" /> : null}
                <span>{t("intake.owner.step", { n: st.n })}</span>
                <span>· {done ? t("intake.owner.done") : active ? "" : t("intake.owner.next")}</span>
              </div>
              <h2 className={cn("mt-1 font-semibold", active ? "text-lg" : "text-sm")}>{st.title}</h2>
              {active && <p className="mt-1 text-sm text-muted-foreground">{st.body}</p>}
              {active && st.cta && <div className="mt-3 flex flex-wrap gap-2">{st.cta}</div>}
            </li>
          );
        })}
      </ol>
      {signing && <DocuSealSigner contract={signing} party="owner" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader question={t("intake.owner.question")} />
      {children}
    </div>
  );
}
