import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitch } from "@/components/layout/AppShell";
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n";

/**
 * Public frame of the sign-in screens: no rail, no top bar. The SM logo, one bordered card in the middle and
 * "by Strategic Mates" at the bottom. The business white label never applies here (nobody is signed in yet).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();

  // Same as the AppShell: restore the saved language after hydration to avoid SSR mismatches.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === "es" || saved === "en") {
        void i18n.changeLanguage(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // Storage blocked (private mode): keep Spanish.
    }
  }, [i18n]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex justify-end px-4 py-3 sm:px-6">
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex justify-center">
            <Logo variant="horizontal" className="h-10 w-auto" />
          </div>
          {/* Gold only as a thin accent on top of the card. */}
          <div className="rounded-[4px] border border-border border-t-2 border-t-gold bg-surface p-6 sm:p-8">
            {children}
          </div>
        </div>
      </main>
      <footer className="flex items-center justify-center gap-2 border-t border-border bg-surface py-4 text-xs text-muted-foreground">
        <Logo variant="isotype" className="h-4 w-4" />
        <span>{t("auth.by_sm")}</span>
      </footer>
    </div>
  );
}

/** Screen title and one short line under it. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string | undefined }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
