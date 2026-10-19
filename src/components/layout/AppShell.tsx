import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronsLeft, ChevronsRight, Search, Check, Eye, LogOut, Menu, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { isNavActive, navFor } from "./nav";
import { firmName } from "@/components/office/shared";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";
import { brandStyle } from "@/lib/brand/style";
import type { BusinessBrand } from "@/lib/api/types";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/lib/i18n";
import { loginSearchFor } from "@/lib/auth/redirect";
import { onSessionExpired } from "@/lib/api/http/session-events";
import { useBusinesses, useCurrentUser, useIsAuthenticated, useIsFranchisor, useIsOnboarding, useLogout, useMyBrand, useSetViewAs, useViewAsOptions } from "@/lib/api/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function Rail({ collapsed, onToggle, brand, mobile = false }: { collapsed: boolean; onToggle: () => void; brand: BusinessBrand | null; mobile?: boolean }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>)["view"] });
  const { data: me } = useCurrentUser();
  const { data: businesses } = useBusinesses();
  const franchisor = useIsFranchisor();
  const onboarding = useIsOnboarding();
  const items = navFor(me?.role, { franchisor, onboarding });
  const brandName = brand ? businesses?.find((b) => b.id === brand.business_id)?.name ?? "" : "";
  return (
    <aside
      className={cn(
        "shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        mobile ? "flex h-full w-full" : "hidden md:flex",
        !mobile && (collapsed ? "w-16" : "w-60"),
      )}
    >
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-sidebar-border", collapsed ? "justify-center px-0" : "px-4")}>
        {brand ? (
          // The business brand on top of the rail. With a logo image, the logo alone (it already carries the name)
          // and the role under it; without one, the initials square next to the name and the role.
          brand.logo_url && !collapsed ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <BrandLogo name={brandName} palette={brand} compact />
              <span className="text-[11px] text-sidebar-muted">{t(franchisor ? "roles.franchisor" : `roles.${me?.role ?? "partner_firm"}`)}</span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              {brand.logo_url ? (
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[4px] font-display text-xs font-bold" style={{ backgroundColor: brand.accent_color, color: brand.primary_color }}>{brandName.slice(0, 1).toUpperCase()}</span>
              ) : (
                <BrandLogo name={brandName} palette={brand} compact />
              )}
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-display text-sm font-semibold" style={brand.font_family ? { fontFamily: `${brand.font_family}, Inter, sans-serif` } : undefined}>{brandName}</div>
                  <div className="text-[11px] text-sidebar-muted">{t(franchisor ? "roles.franchisor" : `roles.${me?.role ?? "partner_firm"}`)}</div>
                </div>
              )}
            </div>
          )
        ) : (
          <>
            <Logo variant="isotype" className="h-8 w-8" />
            {!collapsed && (
              <div className="leading-tight">
                <div className="font-display text-sm font-semibold">{t("app.name")}</div>
                <div className="text-[11px] text-sidebar-muted">{t(franchisor ? "roles.franchisor" : `roles.${me?.role ?? "partner_firm"}`)}</div>
              </div>
            )}
          </>
        )}
      </div>
      <nav aria-label={t("nav.main")} className="flex-1 space-y-0.5 p-2">
        {items.map((item) => {
          const active = isNavActive(item, items, pathname, view);
          const Icon = item.icon;
          const link = (
            <Link
              key={item.key}
              to={item.to}
              search={item.view ? { view: item.view } : {}}
              className={cn(
                "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-sidebar-indicator" />}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{t(`nav.${item.key}`)}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
      {brand && (
        // Under the brand, small: the portal runs on Strategic Mates.
        <div className={cn("flex items-center gap-2 border-t border-sidebar-border px-4 py-2 text-[11px] text-sidebar-muted", collapsed && "justify-center px-0")} title={t("brand.with_sm")}>
          <Logo variant="isotype" className="h-4 w-4 opacity-80" />
          {!collapsed && <span>{t("brand.with_sm")}</span>}
        </div>
      )}
      {mobile ? (
        // On small screens the language switch lives in the menu panel so the top bar keeps its width.
        <div className="border-t border-sidebar-border p-3"><LanguageSwitch /></div>
      ) : (
      <button
        onClick={onToggle}
        className={cn(
          "m-2 flex h-9 items-center gap-3 rounded-md px-3 text-xs text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          collapsed && "justify-center px-0",
        )}
        aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && t("nav.collapse")}
      </button>
      )}
    </aside>
  );
}

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const set = (lng: Language) => {
    void i18n.changeLanguage(lng);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  };
  const isEn = i18n.language === "en";
  return (
    <div role="group" aria-label={t("topbar.language")} className="relative grid h-8 grid-cols-2 items-center rounded-md border border-border bg-surface p-0.5">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[4px] bg-primary transition-transform duration-300 ease-out",
          isEn && "translate-x-full",
        )}
      />
      {(["es", "en"] as const).map((lng) => (
        <button
          key={lng}
          onClick={() => set(lng)}
          aria-pressed={i18n.language === lng}
          className={cn(
            "relative z-10 h-full w-8 rounded-[4px] font-display text-xs font-semibold uppercase transition-colors duration-300",
            i18n.language === lng ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}

function ViewAs() {
  const { t } = useTranslation();
  const { data: me } = useCurrentUser();
  const { data: options } = useViewAsOptions();
  const setViewAs = useSetViewAs();
  const enabled = options?.filter((o) => o.enabled) ?? [];
  const firms = enabled.filter((o) => o.user.role === "partner_firm");
  const owners = enabled.filter((o) => o.user.role === "business_owner");
  const smTeam = enabled.filter((o) => o.user.role === "sm_team");
  const smGlobal = enabled.filter((o) => o.user.role === "sm_global");
  const bishops = enabled.filter((o) => o.user.role === "bishop");
  const franchisees = enabled.filter((o) => o.user.role === "franchisee");
  const isTeamMember = (o: (typeof enabled)[number]) => o.user.role === "business_owner" && !!o.business && o.business.owner_user_id !== o.user.id;
  const label = (o: (typeof enabled)[number]) => {
    switch (o.user.role) {
      case "sm_team": return `${o.user.full_name} (${o.organization?.name ?? ""}${o.user.is_admin ? `, ${t("topbar.admin")}` : ""})`;
      case "sm_global": return `${t("topbar.role_global")} (${o.user.full_name})`;
      case "bishop": return `${t("topbar.role_bishop")} (${o.user.full_name})`;
      case "franchisee": return `${t("topbar.role_franchisee")} (${o.user.full_name})`;
      case "business_owner":
        return o.business?.status === "franchisor"
          ? `${t("topbar.role_small_business")} · ${o.business.name} (${t("topbar.franchisor")}, ${o.user.full_name})`
          : isTeamMember(o)
            ? `${o.business?.name ?? ""} (${t("topbar.team_member")}, ${o.user.full_name})`
            : o.organization?.name ?? `${o.user.full_name} (${o.business?.name ?? ""})`;
      case "partner_firm": return `${firmName(t, o.organization)} · ${o.user.full_name}${o.user.is_admin ? ` (${t("topbar.admin")})` : ""}`;
      default: return `${o.organization?.name ?? ""} (${o.user.full_name}${o.user.is_admin ? `, ${t("topbar.admin")}` : ""})`;
    }
  };
  const currentOpt = enabled.find((o) => o.user.id === me?.id);
  const pick = (o: (typeof enabled)[number]) =>
    setViewAs.mutate(o.user.id, {
      onSuccess: () => toast.success(t("topbar.switched", { name: label(o) })),
      onError: () => toast.error(t("topbar.switch_error")),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${t("topbar.view_as")}: ${currentOpt ? label(currentOpt) : ""}`} className="flex h-8 min-w-0 max-w-[8.5rem] items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm hover:bg-muted sm:max-w-none md:min-w-60">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">{t("topbar.view_as")}:</span>
        <span className="truncate font-medium">{currentOpt ? label(currentOpt) : "…"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.view_as_title")}</DropdownMenuLabel>
        {firms.map((o) => (
          <DropdownMenuItem
            key={o.user.id}
            onSelect={() => pick(o)}
            className="flex items-start gap-2"
          >
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div>
              <div className="font-medium">{o.organization?.name}</div>
              <div className="text-xs text-muted-foreground">
                {o.user.full_name}{o.user.is_admin ? ` (${t("topbar.admin")})` : ""} · {o.organization?.area ? t(`areas.${o.organization.area}`) : ""}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.role_owner")}</DropdownMenuLabel>
        {owners.map((o) => (
          <DropdownMenuItem key={o.user.id} onSelect={() => pick(o)} className="flex items-start gap-2">
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div>
              <div className="font-medium">{o.user.full_name}</div>
              <div className="text-xs text-muted-foreground">
                {o.business?.status === "franchisor" ? `${o.business.name} · ${t("topbar.franchisor")}` : isTeamMember(o) ? `${o.business?.name} · ${t("topbar.team_member")}` : o.business?.name}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.role_sm")}</DropdownMenuLabel>
        {smTeam.map((o) => (
          <DropdownMenuItem key={o.user.id} onSelect={() => pick(o)} className="flex items-start gap-2">
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div>
              <div className="font-medium">{o.user.full_name}</div>
              <div className="text-xs text-muted-foreground">{o.organization?.name}{o.user.is_admin ? ` · ${t("topbar.admin")}` : ""}</div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.role_global")}</DropdownMenuLabel>
        {smGlobal.map((o) => (
          <DropdownMenuItem key={o.user.id} onSelect={() => pick(o)} className="flex items-start gap-2">
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div>
              <div className="font-medium">{o.user.full_name}</div>
              <div className="text-xs text-muted-foreground">{o.organization?.name}</div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.role_bishop")}</DropdownMenuLabel>
        {bishops.map((o) => (
          <DropdownMenuItem key={o.user.id} onSelect={() => pick(o)} className="flex items-start gap-2">
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div className="font-medium">{o.user.full_name}</div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("topbar.role_franchisee")}</DropdownMenuLabel>
        {franchisees.map((o) => (
          <DropdownMenuItem key={o.user.id} onSelect={() => pick(o)} className="flex items-start gap-2">
            <Check className={cn("mt-0.5 h-4 w-4", o.user.id === me?.id ? "opacity-100" : "opacity-0")} />
            <div>
              <div className="font-medium">{o.user.full_name}</div>
              <div className="text-xs text-muted-foreground">{o.organization?.name}</div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Without a session, every screen of the shell goes to /login, keeping the attempted path in ?next= (the login
 * honors it only for paths of this app). The public sign-in screens never get here: the root renders them
 * outside the AppShell.
 * A role only reaches the screens of its own menu (plus Mi perfil and the task detail). Typing another role's URL
 * (a firm opening /negocios) goes back to its home. The data layer scopes the data anyway; this keeps the UI honest.
 */
function RouteGuard({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const { data: me } = useCurrentUser();
  const franchisor = useIsFranchisor();
  const onboarding = useIsOnboarding();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  // A 401 from any HTTP adapter means the session ended (expired or revoked elsewhere): back to /login, keeping
  // where the person was. The mock never emits it.
  useEffect(
    () => onSessionExpired(() => void navigate({ to: "/login", search: loginSearchFor(href), replace: true })),
    [navigate, href],
  );
  if (!authenticated) return <Navigate to="/login" search={loginSearchFor(href)} replace />;
  if (!me) return <>{children}</>;
  const allowed = [...navFor(me.role, { franchisor, onboarding }).map((i) => i.to), "/perfil", "/tareas"];
  const ok = pathname === "/" || allowed.some((p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)));
  return ok ? <>{children}</> : <Navigate to="/" />;
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>)["view"] });
  const { data: me } = useCurrentUser();
  const franchisor = useIsFranchisor();
  const onboarding = useIsOnboarding();
  const items = navFor(me?.role, { franchisor, onboarding });
  const current = items.find((n) => isNavActive(n, items, pathname, view));
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-6">
      <button onClick={onMenu} aria-label={t("nav.main")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
        <Menu className="h-4 w-4" />
      </button>
      {/* The screen name keeps a readable minimum on phones; "Ver como" shrinks instead. */}
      <div className="min-w-[5.5rem] flex-1 truncate font-semibold">{current ? t(`pages.${current.key}.title`) : pathname === "/perfil" ? t("pages.profile.title") : ""}</div>
      <label className="relative hidden w-72 md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={t("topbar.search_placeholder")}
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </label>
      <NotificationBell />
      <div className="hidden shrink-0 md:block"><LanguageSwitch /></div>
      <ViewAs />
      <UserMenu />
    </header>
  );
}

/**
 * The avatar opens the account menu: who is signed in, Mi perfil (SM has no "Mi perfil" in the rail; the booking
 * link lives there) and Cerrar sesión.
 */
function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const logout = useLogout();
  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => void navigate({ to: "/login", replace: true }),
      onError: () => toast.error(t("auth.logout.error")),
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={me?.full_name}
        aria-label={t("topbar.account")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {me ? initials(me.full_name) : ""}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {me && (
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium text-foreground">{me.full_name}</div>
            <div className="truncate text-xs text-muted-foreground">{me.email}</div>
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil" className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            {t("nav.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut} disabled={logout.isPending} className="flex items-center gap-2">
          <LogOut className="h-4 w-4" />
          {t("auth.logout.action")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <RouteGuard>
      <Shell>{children}</Shell>
    </RouteGuard>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  // Brand of the current user's business (owner, team, franchisor, franchises); null keeps the SM brand.
  const brand = useMyBrand().data ?? null;

  // Small screens hide the rail; the menu button opens the same menu as a side panel.
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMenuOpen(false), [pathname]);

  // Restore saved language after hydration to avoid SSR mismatches.
  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "es" || saved === "en") {
      void i18n.changeLanguage(saved);
      document.documentElement.lang = saved;
    }
  }, [i18n]);

  return (
    <TooltipProvider delayDuration={200}>
      <div key={i18n.language} className="lang-fade flex h-screen overflow-hidden bg-background" style={brandStyle(brand)} data-brand={brand ? brand.business_id : undefined}>
        <Rail collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} brand={brand} />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-64 border-0 p-0 [&>button]:text-sidebar-foreground" style={brandStyle(brand)}>
            <SheetTitle className="sr-only">{t("nav.main")}</SheetTitle>
            <Rail mobile collapsed={false} onToggle={() => setMenuOpen(false)} brand={brand} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMenuOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function PageHeader({ pageKey }: { pageKey: "home" | "tasks" | "clients" | "report" | "profile" }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t(`pages.${pageKey}.title`)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t(`pages.${pageKey}.subtitle`)}</p>
    </div>
  );
}
