import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useAcceptInvitation,
  useCurrentUser,
  useExchangeInvitation,
  useIsAuthenticated,
  useLinkLifetimes,
  useLogout,
} from "@/lib/api/hooks";
import type { InvitationPreview } from "@/lib/api/types";
import { MIN_PASSWORD_LENGTH } from "@/lib/api/types";
import {
  acceptInvitationProblem,
  authErrorCode,
  focusFirstError,
  newPasswordProblem,
  type TokenErrorCode,
} from "@/lib/auth/form";
import { nextStepAfterSignIn } from "@/lib/auth/two-factor";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import {
  AuthField,
  BackToLogin,
  FormAlert,
  PasswordHint,
  PendingState,
  SubmitButton,
} from "./AuthFields";

/** /invitacion/$token: who invited you and to what, then name, password and terms to create the account. */
export function InvitationPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const preview = useExchangeInvitation(token);
  // A token that went bad while filling the form (it expired, or was used in another tab).
  const [lateTokenError, setLateTokenError] = useState<TokenErrorCode | null>(null);

  if (preview.isPending) {
    return (
      <AuthLayout>
        <AuthHeading title={t("auth.invitation.title")} />
        <PendingState label={t("auth.invitation.loading")} />
      </AuthLayout>
    );
  }
  const code = lateTokenError ?? (preview.isError ? authErrorCode(preview.error) : null);
  if (code || !preview.data)
    return <InvitationProblem code={code ?? "generic"} onRetry={() => void preview.refetch()} />;
  return <AcceptForm token={token} preview={preview.data} onTokenError={setLateTokenError} />;
}

/** Expired, used or unknown invitation: plain words and the next step. */
function InvitationProblem({ code, onRetry }: { code: string; onRetry: () => void }) {
  const { t } = useTranslation();
  const invitationDays = useLinkLifetimes().data?.invitation_days;
  const [asked, setAsked] = useState(false);
  const content =
    code === "token_expired"
      ? {
          title: t("auth.invitation.expired_title"),
          body: t("auth.invitation.expired_body", { days: invitationDays ?? "…" }),
        }
      : code === "token_used"
        ? { title: t("auth.invitation.used_title"), body: t("auth.invitation.used_body") }
        : code === "token_invalid"
          ? { title: t("auth.invitation.invalid_title"), body: t("auth.token.invalid_help") }
          : { title: t("auth.errors.generic"), body: t("auth.errors.generic_help") };

  return (
    <AuthLayout>
      <AuthHeading title={t("auth.invitation.title")} />
      <FormAlert tone="error" title={content.title}>
        {content.body}
      </FormAlert>
      <div className="mt-6 flex flex-col items-start gap-4 border-t border-border pt-5">
        {code === "generic" ? (
          <Button type="button" onClick={onRetry} className="h-10 w-full rounded-[4px]">
            {t("errors.retry")}
          </Button>
        ) : (
          code !== "token_used" &&
          // No endpoint for this yet: the consultant sends a new invitation from the portal.
          (asked ? (
            <div
              role="status"
              className="w-full rounded-[4px] border border-border px-3.5 py-3 text-sm text-foreground"
            >
              {t("auth.invitation.request_new_note")}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAsked(true)}
              className="h-10 w-full rounded-[4px]"
            >
              {t("auth.invitation.request_new")}
            </Button>
          ))
        )}
        <BackToLogin label={t("auth.invitation.go_login")} />
      </div>
    </AuthLayout>
  );
}

interface AcceptErrors {
  name: string | null;
  password: string | null;
  confirm: string | null;
  terms: string | null;
}
const NO_ERRORS: AcceptErrors = { name: null, password: null, confirm: null, terms: null };
/** The alert over the form: locale keys of its title and its body. */
type AcceptAlert = { title: string; body: string };

function AcceptForm({
  token,
  preview,
  onTokenError,
}: {
  token: string;
  preview: InvitationPreview;
  onTokenError: (code: TokenErrorCode) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const accept = useAcceptInvitation();
  const logout = useLogout();
  const [name, setName] = useState(preview.full_name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<AcceptErrors>(NO_ERRORS);
  const [alert, setAlert] = useState<AcceptAlert | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  // Another person's session open in this browser (someone of SM who sent the invitation from here, say): creating the
  // account would start its session over that one, so the person signs out first. The token stays in the address.
  const authenticated = useIsAuthenticated();
  const sessionUser = useCurrentUser().data;
  const [sessionRefused, setSessionRefused] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const otherSession =
    authenticated &&
    !!sessionUser &&
    (sessionRefused || sessionUser.email.toLowerCase() !== preview.email.toLowerCase());

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const fail = (next: AcceptErrors, problem: AcceptAlert | null = null) => {
    setErrors(next);
    setAlert(problem);
    setFailedAttempt((n) => n + 1);
  };

  const signOut = () => {
    setSignOutFailed(false);
    logout.mutate(undefined, {
      onSuccess: () => setSessionRefused(false),
      onError: () => setSignOutFailed(true),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: AcceptErrors = {
      name: name.trim() ? null : t("auth.validation.name_required"),
      password: newPasswordProblem(password)
        ? t("auth.validation.password_short", { min: MIN_PASSWORD_LENGTH })
        : null,
      confirm:
        !newPasswordProblem(password) && confirm !== password
          ? t("auth.validation.password_mismatch")
          : null,
      terms: terms ? null : t("auth.validation.terms_required"),
    };
    if (Object.values(next).some(Boolean)) return fail(next);
    setErrors(NO_ERRORS);
    setAlert(null);
    accept.mutate(
      { token, name: name.trim(), password, accepted_terms: true },
      {
        onSuccess: (result) => {
          const step = nextStepAfterSignIn(result);
          if (step.kind === "signed_in") return void navigate({ href: step.href, replace: true });
          void navigate({ to: step.to, search: step.search, state: step.state, replace: true });
        },
        // Each code of the API in plain words (acceptInvitationProblem): the field to fix, the bad link, the open
        // session or one alert. Only a request that never reached the API asks to check the connection.
        onError: (err) => {
          const problem = acceptInvitationProblem(err);
          if (problem.kind === "token") return onTokenError(problem.code);
          if (problem.kind === "session") return setSessionRefused(true);
          if (problem.kind === "alert")
            return fail(NO_ERRORS, { title: problem.title, body: problem.body });
          const fieldErrors: AcceptErrors = { ...NO_ERRORS };
          fieldErrors[problem.field] = t(problem.key, { min: MIN_PASSWORD_LENGTH });
          fail(fieldErrors);
        },
      },
    );
  };

  const inviter = preview.invited_by_name;
  const placeName = preview.business_name ?? preview.organization_name;
  const linkClass = "font-medium text-primary underline underline-offset-2";

  return (
    <AuthLayout>
      <AuthHeading
        title={t("auth.invitation.title")}
        subtitle={
          inviter ? t("auth.invitation.intro", { inviter }) : t("auth.invitation.intro_no_inviter")
        }
      />
      {/* Recognition over recall: what this account is for and which email it uses. */}
      <dl className="mb-6 divide-y divide-border rounded-[4px] border border-border text-sm">
        {placeName && (
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-muted-foreground">
              {preview.business_name
                ? t("auth.invitation.business")
                : t("auth.invitation.organization")}
            </dt>
            <dd className="text-right font-medium text-foreground">{placeName}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-muted-foreground">{t("auth.invitation.role")}</dt>
          <dd className="text-right font-medium text-foreground">{t(`roles.${preview.role}`)}</dd>
        </div>
        <div className="flex justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-muted-foreground">{t("auth.invitation.email")}</dt>
          <dd className="min-w-0 break-all text-right font-medium text-foreground">
            {preview.email}
          </dd>
        </div>
      </dl>

      {otherSession ? (
        <div
          role="status"
          className="space-y-3 rounded-[4px] border border-border px-3.5 py-3 text-sm text-foreground"
        >
          <p>{t("auth.invitation.session_open", { name: sessionUser?.full_name ?? "" })}</p>
          {signOutFailed && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("auth.invitation.session_sign_out_error")}
            </p>
          )}
          <Button
            type="button"
            onClick={signOut}
            disabled={logout.isPending}
            aria-busy={logout.isPending || undefined}
            className="h-10 w-full rounded-[4px]"
          >
            {logout.isPending && <Loader2 aria-hidden className="animate-spin" />}
            {logout.isPending
              ? t("auth.invitation.session_signing_out")
              : t("auth.invitation.session_sign_out")}
          </Button>
        </div>
      ) : (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
          {alert && (
            <FormAlert tone="error" title={t(alert.title)}>
              {t(alert.body)}
            </FormAlert>
          )}
          <AuthField
            id="name"
            autoComplete="name"
            label={t("auth.fields.name")}
            value={name}
            onChange={setName}
            error={errors.name}
            disabled={accept.isPending}
          />
          <AuthField
            id="new-password"
            type="password"
            autoComplete="new-password"
            label={t("auth.fields.password")}
            value={password}
            onChange={setPassword}
            error={errors.password}
            hint={<PasswordHint value={password} />}
            disabled={accept.isPending}
          />
          <AuthField
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            label={t("auth.fields.confirm_password")}
            value={confirm}
            onChange={setConfirm}
            error={errors.confirm}
            disabled={accept.isPending}
          />
          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="terms"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                disabled={accept.isPending}
                aria-invalid={errors.terms ? true : undefined}
                aria-describedby={errors.terms ? "terms-error" : undefined}
                className={cn("mt-0.5 rounded-[2px]", errors.terms && "border-destructive")}
              />
              <label htmlFor="terms" className="text-sm leading-snug text-foreground">
                {/* Placeholders until Strategic Mates publishes both pages. */}
                <Trans
                  i18nKey="auth.invitation.terms"
                  components={{
                    terms: <a href="#terminos" className={linkClass} />,
                    privacy: <a href="#privacidad" className={linkClass} />,
                  }}
                />
              </label>
            </div>
            {errors.terms && (
              <p id="terms-error" className="text-xs font-medium text-destructive">
                {errors.terms}
              </p>
            )}
          </div>
          <SubmitButton
            pending={accept.isPending}
            label={t("auth.invitation.submit")}
            pendingLabel={t("auth.invitation.pending")}
          />
          <p className="text-xs text-muted-foreground">
            {t("auth.invitation.expires", { date: formatDate(preview.expires_at, i18n.language) })}
          </p>
        </form>
      )}
      <div className="mt-6 border-t border-border pt-5">
        <BackToLogin label={t("auth.invitation.go_login")} />
      </div>
    </AuthLayout>
  );
}
