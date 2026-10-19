import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import "../lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { isPublicAuthPath } from "@/lib/auth/redirect";

const primaryBtn =
  "inline-flex items-center justify-center rounded-[4px] bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover";
const secondaryBtn =
  "inline-flex items-center justify-center rounded-[4px] border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-foreground transition-colors hover:bg-muted";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-5xl font-semibold tabular-nums text-muted-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{t("errors.not_found_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.not_found_body")}</p>
        <div className="mt-6">
          <Link to="/" className={primaryBtn}>
            {t("errors.go_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("errors.load_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.load_body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className={primaryBtn}
          >
            {t("errors.retry")}
          </button>
          <a href="/" className={secondaryBtn}>
            {t("errors.go_home")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SM Platform · Strategic Mates" },
      { name: "description", content: "Portal interno de Strategic Mates para el Método 180." },
      { name: "author", content: "Strategic Mates" },
      { property: "og:title", content: "SM Platform · Strategic Mates" },
      { property: "og:description", content: "Portal interno de Strategic Mates para el Método 180." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Sign-in screens are public: no rail, no top bar, no route guard. They bring their own AuthLayout.
  const isPublic = useRouterState({ select: (s) => isPublicAuthPath(s.location.pathname) });

  return (
    <QueryClientProvider client={queryClient}>
      {isPublic ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
