import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCreateOwnNda, useOwnNdaTemplate, useUpdateOwnNda } from "@/lib/api/hooks";
import type { Contract, OwnNdaSummary } from "@/lib/api/types";
import { OWN_NDA_MAX_LENGTH, ownNdaBodyError, ownNdaEditable, ownNdaView } from "@/lib/leads/entry-flow";
import { primaryButtonCls, secondaryButtonCls } from "../shared";

const linkCls = "text-sm text-link hover:underline";
const ERROR_CODES = ["body_required", "body_too_long", "own_nda_exists"] as const;
type BodyErrorCode = (typeof ERROR_CODES)[number];

/**
 * "Protege tu información": the owner may write his own confidentiality agreement in the portal (the template comes
 * filled with his business and his name) and send it for Strategic Mates to sign. He can change the text while
 * nobody signed it; once Strategic Mates signed, he reads it and may sign it too. Nothing to download or upload.
 */
export function OwnNdaCard(props: {
  businessId: string;
  own: OwnNdaSummary | null;
  contract: Contract | null;
  onView: (c: Contract) => void;
  onSign: (c: Contract) => void;
}) {
  const { t } = useTranslation();
  const view = ownNdaView(props.own);
  const [editing, setEditing] = useState(false);
  const status = (text: string) => <p className="text-sm font-medium" role="status">{text}</p>;

  return (
    <section className="rounded-[4px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">{t("intake.owner.own_nda.title")}</h3>
      {editing ? (
        <OwnNdaEditor businessId={props.businessId} existing={view === "none" ? null : props.contract} onDone={() => setEditing(false)} />
      ) : view === "none" ? (
        <div className="mt-1 space-y-3">
          <p className="text-sm text-muted-foreground">{t("intake.owner.own_nda.body")}</p>
          <button className={secondaryButtonCls} onClick={() => setEditing(true)}>{t("intake.owner.own_nda.write")}</button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {status(t(`intake.owner.own_nda.status_${view}`))}
          <div className="flex flex-wrap items-center gap-4">
            {props.contract && <button className={linkCls} onClick={() => props.onView(props.contract!)}>{t("intake.owner.own_nda.view")}</button>}
            {ownNdaEditable(props.own) && <button className={linkCls} onClick={() => setEditing(true)}>{t("intake.owner.own_nda.edit")}</button>}
            {view === "signed_by_sm" && props.contract && (
              <button className={linkCls} onClick={() => props.onSign(props.contract!)}>{t("intake.owner.own_nda.sign_too")}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A plain textarea that grows with the text, prefilled with the template (or the text already sent). */
function OwnNdaEditor({ businessId, existing, onDone }: { businessId: string; existing: Contract | null; onDone: () => void }) {
  const { t } = useTranslation();
  const template = useOwnNdaTemplate(businessId, !existing);
  const create = useCreateOwnNda();
  const update = useUpdateOwnNda();
  const [body, setBody] = useState<string | null>(existing?.body ?? null);
  const [error, setError] = useState<BodyErrorCode | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const text = body ?? template.data?.body ?? "";
  const pending = create.isPending || update.isPending;

  // Auto-height: the whole agreement is visible without an inner scroll (runs only in the browser).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  const send = () => {
    const local = ownNdaBodyError(text);
    if (local) return setError(local);
    setError(null);
    const onError = (e: Error) => {
      const code = ERROR_CODES.find((c) => c === e.message);
      if (code) setError(code);
      else toast.error(t("owner_extra.common.t_error"));
    };
    if (existing) {
      update.mutate({ businessId, body: text }, { onSuccess: () => { toast.success(t("intake.owner.own_nda.t_updated")); onDone(); }, onError });
    } else {
      create.mutate({ businessId, body: text }, { onSuccess: () => { toast.success(t("intake.owner.own_nda.t_sent")); onDone(); }, onError });
    }
  };

  if (!existing && template.isLoading) return <p className="mt-2 text-sm text-muted-foreground">{t("intake.owner.own_nda.loading")}</p>;
  if (!existing && template.isError)
    return <button className={`mt-2 ${linkCls}`} onClick={() => void template.refetch()}>{t("intake.owner.own_nda.retry")}</button>;

  return (
    <div className="mt-2 space-y-2">
      <label htmlFor="own-nda-body" className="block text-sm text-muted-foreground">{t("intake.owner.own_nda.hint")}</label>
      <textarea
        id="own-nda-body" ref={area} value={text} maxLength={OWN_NDA_MAX_LENGTH} rows={12}
        aria-invalid={!!error} aria-describedby={error ? "own-nda-error" : undefined}
        onChange={(e) => { setBody(e.target.value); if (error) setError(null); }}
        className="block w-full resize-none overflow-hidden rounded-[4px] border border-input bg-surface px-3 py-2 font-sans text-sm leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      {error && <p id="own-nda-error" role="alert" className="text-xs text-status-danger-fg">{t(`intake.owner.own_nda.errors.${error}`)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryButtonCls} disabled={pending} onClick={send}>
          {t(existing ? "intake.owner.own_nda.save" : "intake.owner.own_nda.send")}
        </button>
        <button className={linkCls} disabled={pending} onClick={onDone}>{t("intake.cancel")}</button>
      </div>
    </div>
  );
}
