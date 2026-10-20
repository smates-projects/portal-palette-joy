import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AuthField, FormAlert } from "@/components/auth/AuthFields";
import { TwoFactorSetupSteps } from "@/components/auth/TwoFactorSetupSteps";
import { useDisableTwoFactor } from "@/lib/api/hooks";
import { TOTP_CODE_LENGTH, type User } from "@/lib/api/types";
import { authErrorCode, focusFirstError } from "@/lib/auth/form";
import { cleanTotpInput, isCompleteTotp } from "@/lib/auth/two-factor";

type Mode = "idle" | "enabling" | "disabling";

const secondaryBtn =
  "h-8 rounded-[4px] border border-border px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50";
const primaryBtn =
  "h-8 rounded-[4px] bg-primary px-3 font-display text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

/**
 * Mi perfil: "Verificación en dos pasos". Activar opens the setup inline (signed in, no setup token); Desactivar asks
 * for a current code. The state shown is the profile's two_factor_enabled (absent reads as off).
 */
export function TwoFactorSection({ me }: { me: User }) {
  const { t } = useTranslation();
  const disable = useDisableTwoFactor();
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<"invalid_code" | "generic" | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const enabled = me.two_factor_enabled === true;

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const close = () => {
    setMode("idle");
    setCode("");
    setFieldError(null);
    setServerError(null);
  };

  const onDisable = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanTotpInput(code);
    if (!isCompleteTotp(clean)) {
      setFieldError(t("auth.two_factor.code_required", { digits: TOTP_CODE_LENGTH }));
      setServerError(null);
      return setFailedAttempt((n) => n + 1);
    }
    setFieldError(null);
    setServerError(null);
    disable.mutate(clean, {
      onSuccess: () => {
        close();
        toast.success(t("profile.two_factor.t_disabled"));
      },
      onError: (err) => {
        setCode("");
        setServerError(authErrorCode(err) === "invalid_code" ? "invalid_code" : "generic");
        setFailedAttempt((n) => n + 1);
      },
    });
  };

  return (
    <section className="rounded-md border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t("profile.two_factor.title")}
              <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                {enabled ? t("profile.two_factor.state_on") : t("profile.two_factor.state_off")}
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {enabled ? t("profile.two_factor.on") : t("profile.two_factor.off")}
            </p>
          </div>
        </div>
        {mode === "idle" &&
          (enabled ? (
            <button type="button" onClick={() => setMode("disabling")} className={secondaryBtn}>
              {t("profile.two_factor.disable")}
            </button>
          ) : (
            <button type="button" onClick={() => setMode("enabling")} className={primaryBtn}>
              {t("profile.two_factor.enable")}
            </button>
          ))}
        {mode !== "idle" && (
          <button type="button" onClick={close} className={secondaryBtn}>
            {t("profile.two_factor.cancel")}
          </button>
        )}
      </div>

      {mode === "enabling" && (
        <div className="mt-4 max-w-md border-t border-border pt-4">
          <TwoFactorSetupSteps
            setupToken={null}
            onFinished={() => {
              close();
              toast.success(t("profile.two_factor.t_enabled"));
            }}
          />
        </div>
      )}

      {mode === "disabling" && (
        <form
          ref={formRef}
          onSubmit={onDisable}
          noValidate
          className="mt-4 max-w-md space-y-4 border-t border-border pt-4"
        >
          <div>
            <h3 className="text-sm font-semibold">{t("profile.two_factor.disable_title")}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("profile.two_factor.disable_body")}
            </p>
          </div>
          {serverError === "invalid_code" && (
            <FormAlert tone="error" title={t("auth.two_factor.invalid_code")}>
              {t("auth.two_factor.invalid_code_help")}
            </FormAlert>
          )}
          {serverError === "generic" && (
            <FormAlert tone="error" title={t("auth.errors.generic")}>
              {t("profile.two_factor.error")}
            </FormAlert>
          )}
          <AuthField
            id="disable-code"
            label={t("auth.two_factor.code_label")}
            value={code}
            onChange={(value) => setCode(cleanTotpInput(value))}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={TOTP_CODE_LENGTH}
            code
            error={fieldError}
            invalid={serverError === "invalid_code"}
            disabled={disable.isPending}
            hint={t("auth.two_factor.code_hint")}
          />
          <button type="submit" disabled={disable.isPending} className={primaryBtn}>
            {disable.isPending
              ? t("profile.two_factor.disable_pending")
              : t("profile.two_factor.disable_submit")}
          </button>
        </form>
      )}
    </section>
  );
}
