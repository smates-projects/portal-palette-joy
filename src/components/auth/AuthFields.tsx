import { forwardRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface AuthFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "password" | "text";
  autoComplete: "email" | "current-password" | "new-password" | "name";
  /** Shown in red under the field; also marks it invalid for screen readers and focus. */
  error?: string | null | undefined;
  /** Marks the field invalid without a message under it (the form alert already explains it). */
  invalid?: boolean | undefined;
  /** Always visible under the field (for example the password length). */
  hint?: ReactNode;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
}

/** Label, input, hint and error, wired with htmlFor and aria-describedby. */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  {
    id,
    label,
    value,
    onChange,
    type = "text",
    autoComplete,
    error,
    invalid,
    hint,
    placeholder,
    disabled,
  },
  ref,
) {
  const isInvalid = !!error || !!invalid;
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={ref}
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={describedBy}
        spellCheck={type === "text" ? undefined : false}
        className={cn(
          "h-10 rounded-[4px] bg-surface",
          isInvalid && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
        >
          <AlertCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});

/**
 * Bordered message inside the card: what happened and what to do. Errors are announced (role="alert") and can
 * take focus when no field is to blame.
 */
export function FormAlert({
  tone,
  title,
  children,
}: {
  tone: "error" | "success";
  title: string;
  children?: ReactNode;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      tabIndex={-1}
      data-auth-alert={tone === "error" ? "" : undefined}
      className={cn(
        "flex gap-3 rounded-[4px] border bg-surface px-3.5 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "error" ? "border-status-danger-border" : "border-status-success-border",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "error" ? "text-status-danger-fg" : "text-status-success-fg",
        )}
      />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {children && <div className="mt-1 text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** Full-width submit: disabled while the request runs, with a spinner and a "doing it" label. */
export function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="h-10 w-full rounded-[4px]"
    >
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Live length hint for a new password (minimum MIN_PASSWORD_LENGTH characters). */
export function PasswordHint({ value }: { value: string }) {
  const { t } = useTranslation();
  if (!value) return <>{t("auth.password_hint.min", { min: MIN_PASSWORD_LENGTH })}</>;
  const missing = MIN_PASSWORD_LENGTH - value.length;
  if (missing > 0) return <>{t("auth.password_hint.missing", { count: missing })}</>;
  return <span className="text-status-success-fg">{t("auth.password_hint.ok")}</span>;
}

/** Spinner with a sentence, announced politely (loading an invitation, using a magic link). */
export function PendingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 py-6 text-sm text-muted-foreground"
    >
      <Loader2 aria-hidden className="h-5 w-5 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}

const linkClass =
  "text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[2px]";

/** "Volver a entrar": the way back from every public screen. */
export function BackToLogin({ label }: { label?: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Link to="/login" className={linkClass}>
      {label ?? t("auth.back_to_login")}
    </Link>
  );
}

/** A text action that looks like a link (switching forms inside the same card). */
export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={linkClass}>
      {children}
    </button>
  );
}
