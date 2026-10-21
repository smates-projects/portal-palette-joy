import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/lib/api/hooks";
import {
  clearPasswordSetupDismissal,
  dismissPasswordSetup,
  shouldShowPasswordSetup,
} from "@/lib/auth/password-setup";
import { PasswordForm } from "./PasswordForm";

/**
 * "Ya eres parte de Strategic Mates": shown over the whole portal once GET /me says password_setup_required (the
 * owner, or the Bishop, entered through email links and the program started). Nothing behind it is usable: it does
 * not close by clicking outside, with Escape or with an X. "Más tarde" hides it for this browser tab only
 * (sessionStorage) and it comes back on the next entry. Creating the password refreshes /me and the dialog goes.
 */
export function PasswordSetupDialog() {
  const { t } = useTranslation();
  const { data: me } = useCurrentUser();
  // "Más tarde" is kept in sessionStorage; this counter only re-renders after it is written.
  const [, setDismissedAt] = useState(0);
  const open = shouldShowPasswordSetup(me);

  const later = () => {
    dismissPasswordSetup();
    setDismissedAt((n) => n + 1);
  };

  const done = () => {
    clearPasswordSetupDismissal();
    toast.success(t("auth.password_setup.done"));
  };

  return (
    <Dialog open={open}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby="password-setup-description"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] gap-5 rounded-[4px] border border-border bg-surface p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <div className="space-y-2 border-b border-border pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("auth.password_setup.kicker")}
            </p>
            <DialogTitle className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground">
              {t("auth.password_setup.title")}
            </DialogTitle>
            <DialogDescription id="password-setup-description" className="text-sm text-foreground">
              {t("auth.password_setup.body")}
            </DialogDescription>
            <p className="text-sm text-muted-foreground">{t("auth.password_setup.link_note")}</p>
          </div>
          <PasswordForm
            mode="create"
            idPrefix="password-setup"
            submitLabel={t("auth.password_setup.submit")}
            pendingLabel={t("auth.password_setup.pending")}
            onSuccess={done}
            secondary={
              <button
                type="button"
                onClick={later}
                className="h-10 w-full rounded-[4px] border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("auth.password_setup.later")}
              </button>
            }
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
