import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { hasBookingLink } from "@/lib/accounts/permissions";
import { useCurrentUser, useOrganizations, useSetBookingUrl } from "@/lib/api/hooks";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

const valid = (v: string) => /^https?:\/\/\S+\.\S+/.test(v.trim());

/** The personal booking link used by "Agendar reunión" in the pipeline and by the emails of the leads one consults. */
export function BookingUrlSection() {
  const { t } = useTranslation();
  const { data: me } = useCurrentUser();
  const { data: orgs } = useOrganizations();
  const save = useSetBookingUrl();
  const [value, setValue] = useState(me?.booking_url ?? "");
  const [tried, setTried] = useState(false);
  const office = orgs?.find((o) => o.id === me?.organization_id);
  if (!me || !hasBookingLink(me)) return null;
  // SM Global has no office link: without its own the portal's general link is used.
  const officeUrl = office?.default_booking_url ?? "";

  const submit = () => {
    setTried(true);
    if (!valid(value)) return;
    save.mutate(value.trim(), { onSuccess: () => toast.success(t("profile.t_booking_saved")), onError: () => toast.error(t("taskDetail.t_error")) });
  };
  const clear = () => {
    const prev = me.booking_url;
    save.mutate(null, {
      onSuccess: () => {
        setValue("");
        toast.success(t(officeUrl ? "profile.t_booking_cleared" : "profile.t_booking_cleared_general"), { action: prev ? { label: t("profile.undo"), onClick: () => { setValue(prev); save.mutate(prev); } } : undefined });
      },
      onError: () => toast.error(t("taskDetail.t_error")),
    });
  };

  return (
    <section className="rounded-md border border-border bg-surface px-5 py-4">
      <h2 className="text-base font-semibold">{t("profile.booking_title")}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("profile.booking_body")}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("profile.booking_placeholder")}
          aria-label={t("profile.booking_title")}
          className="h-9 min-w-72 flex-1 rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <PrimaryButton onClick={submit} disabled={save.isPending || value.trim() === (me.booking_url ?? "")}>{t("profile.booking_save")}</PrimaryButton>
        {me.booking_url && <SecondaryButton onClick={clear}>{t("profile.booking_clear")}</SecondaryButton>}
      </div>
      {tried && !valid(value) && <p className="mt-1.5 text-xs text-status-danger-fg">{t("profile.booking_invalid")}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {me.booking_url
          ? t("profile.booking_current", { url: me.booking_url })
          : officeUrl
            ? t("profile.booking_default", { url: officeUrl })
            : t("profile.booking_default_general")}
      </p>
    </section>
  );
}
