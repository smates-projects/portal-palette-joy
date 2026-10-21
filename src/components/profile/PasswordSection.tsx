import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PasswordForm } from "@/components/auth/PasswordForm";
import type { User } from "@/lib/api/types";

const secondaryBtn =
  "h-8 rounded-[4px] border border-border px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50";
const primaryBtn =
  "h-8 rounded-[4px] bg-primary px-3 font-display text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

/**
 * Mi perfil: "Contraseña". Without one (the person enters through email links): "Crear contraseña" opens the new
 * password twice. With one: "Cambiar contraseña" asks for the current one as well. The state shown is the
 * profile's has_password (absent reads as created).
 */
export function PasswordSection({ me }: { me: User }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const hasPassword = me.has_password !== false;

  const done = () => {
    setEditing(false);
    toast.success(hasPassword ? t("profile.password.t_changed") : t("profile.password.t_created"));
  };

  return (
    <section className="rounded-md border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <KeyRound aria-hidden className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t("profile.password.title")}
              <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                {hasPassword ? t("profile.password.state_on") : t("profile.password.state_off")}
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasPassword ? t("profile.password.on") : t("profile.password.off")}
            </p>
          </div>
        </div>
        {editing ? (
          <button type="button" onClick={() => setEditing(false)} className={secondaryBtn}>
            {t("profile.password.cancel")}
          </button>
        ) : hasPassword ? (
          <button type="button" onClick={() => setEditing(true)} className={secondaryBtn}>
            {t("profile.password.change")}
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={primaryBtn}>
            {t("profile.password.create")}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-4 max-w-md border-t border-border pt-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">
              {hasPassword
                ? t("profile.password.change_title")
                : t("profile.password.create_title")}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasPassword ? t("profile.password.change_body") : t("profile.password.create_body")}
            </p>
          </div>
          <PasswordForm
            mode={hasPassword ? "change" : "create"}
            idPrefix="profile-password"
            submitLabel={hasPassword ? t("profile.password.change") : t("profile.password.create")}
            pendingLabel={t("profile.password.pending")}
            onSuccess={done}
          />
        </div>
      )}
    </section>
  );
}
