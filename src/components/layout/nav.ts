import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Briefcase,
  FileSignature,
  FileText,
  Handshake,
  Home,
  Landmark,
  Library,
  ListChecks,
  MapPinned,
  Network,
  Filter,
  Receipt,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Store,
  Target,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/api/types";

export type NavKey =
  | "home" | "tasks" | "clients" | "report" | "profile"
  | "calendar" | "manual" | "documents" | "numbers" | "business"
  | "network" | "businesses" | "catalog" | "settings" | "pipeline"
  // SM Global
  | "structure" | "offices" | "global_pipeline" | "global_catalog" | "rules" | "people" | "bishops"
  // Franchisor (business owner whose business is a franchisor)
  | "franchisor" | "franchises"
  // Business Bishop
  | "portfolio" | "opportunities" | "agreements"
  // Franchisee
  | "franchisee_manual" | "payments" | "franchisee_business";

export interface NavItem {
  to:
    | "/" | "/tareas" | "/clientes" | "/reporte" | "/perfil" | "/manual" | "/documentos" | "/numeros" | "/negocio" | "/red" | "/negocios"
    | "/catalogo" | "/configuracion" | "/embudo"
    | "/estructura" | "/oficinas" | "/reglas" | "/personas" | "/franquiciadora" | "/franquicias" | "/oportunidades" | "/acuerdos" | "/pagos" | "/bishops";
  key: NavKey;
  icon: LucideIcon;
  /** Only for "Calendario": Mis tareas opened in the calendar view. */
  view?: "calendar";
}

// Menu for the Partner firm role.
export const partnerFirmNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/clientes", key: "clients", icon: Building2 },
  { to: "/reporte", key: "report", icon: BarChart3 },
  { to: "/perfil", key: "profile", icon: UserRound },
];

// Menu for the Business owner role.
export const ownerNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/reporte", key: "report", icon: BarChart3 },
  { to: "/tareas", key: "calendar", icon: CalendarDays, view: "calendar" },
  { to: "/manual", key: "manual", icon: BookOpen },
  { to: "/documentos", key: "documents", icon: FileText },
  { to: "/numeros", key: "numbers", icon: TrendingUp },
  { to: "/negocio", key: "business", icon: Store },
];

// Business owner still entering (NDA and MOU sent): only Inicio ("Tu ingreso") and Documentos.
export const ownerIntakeNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/documentos", key: "documents", icon: FileText },
];

// Menu for the SM office team.
export const smNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/embudo", key: "pipeline", icon: Filter },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/red", key: "network", icon: Network },
  { to: "/reporte", key: "report", icon: BarChart3 },
  { to: "/negocios", key: "businesses", icon: Building2 },
  { to: "/catalogo", key: "catalog", icon: Library },
  { to: "/configuracion", key: "settings", icon: Settings },
];

// Menu for SM Global (headquarters).
export const smGlobalNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/estructura", key: "structure", icon: Network },
  { to: "/oficinas", key: "offices", icon: Landmark },
  { to: "/embudo", key: "global_pipeline", icon: Filter },
  { to: "/catalogo", key: "global_catalog", icon: Library },
  { to: "/reglas", key: "rules", icon: SlidersHorizontal },
  { to: "/personas", key: "people", icon: Users },
  // Every Bishop with the state of the framework agreement: the CEO countersigns it here.
  { to: "/bishops", key: "bishops", icon: Handshake },
];

// Menu for a business owner whose business is a franchisor (finished the program).
export const franchisorNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/franquiciadora", key: "franchisor", icon: ScrollText },
  { to: "/franquicias", key: "franchises", icon: MapPinned },
  { to: "/numeros", key: "numbers", icon: TrendingUp },
  { to: "/documentos", key: "documents", icon: FileText },
  { to: "/negocio", key: "business", icon: Store },
];

// Menu for Business Bishop. "Mi portafolio" is the home screen.
export const bishopNav: NavItem[] = [
  { to: "/", key: "portfolio", icon: Briefcase },
  { to: "/oportunidades", key: "opportunities", icon: Target },
  { to: "/acuerdos", key: "agreements", icon: FileSignature },
];

// Menu for a franchisee.
export const franchiseeNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/manual", key: "franchisee_manual", icon: BookOpen },
  { to: "/pagos", key: "payments", icon: Receipt },
  { to: "/negocio", key: "franchisee_business", icon: Store },
];

/** An owner of a franchisor business gets the franchisor menu; an owner still in the program keeps the program menu. */
export const navFor = (role: UserRole | undefined, opts: { franchisor?: boolean; onboarding?: boolean } = {}) => {
  switch (role) {
    case "business_owner": return opts.franchisor ? franchisorNav : opts.onboarding ? ownerIntakeNav : ownerNav;
    case "sm_team": return smNav;
    case "sm_global": return smGlobalNav;
    case "bishop": return bishopNav;
    case "franchisee": return franchiseeNav;
    default: return partnerFirmNav;
  }
};

/**
 * Old addresses that moved: SM Global's "Acuerdos" became "Bishops". The Bishop keeps his own /acuerdos. Null when
 * the path did not move for that role.
 */
export function movedPathFor(role: UserRole | undefined, pathname: string): "/bishops" | null {
  return role === "sm_global" && (pathname === "/acuerdos" || pathname.startsWith("/acuerdos/")) ? "/bishops" : null;
}

/** Screens whose content depends on the office in view. "Viendo" shows only there. */
const OFFICE_SCOPED_PATHS = ["/embudo", "/oficinas", "/negocios", "/tareas", "/reporte"] as const;

/**
 * Whether the header "Viendo" selector applies to the screen: Inicio, Embudo, Oficinas, Negocios, Tareas and
 * Reportes filter by office; Bishops, Personas, Reglas, Perfil, Catálogo and Estructura do not, so it hides there.
 */
export function showsOfficeScope(pathname: string): boolean {
  if (pathname === "/") return true;
  return OFFICE_SCOPED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** "Calendario" is active on Mis tareas in calendar view; "Mis tareas" on any other view. */
export function isNavActive(item: NavItem, items: NavItem[], pathname: string, view: unknown) {
  if (item.to === "/") return pathname === "/";
  if (!pathname.startsWith(item.to)) return false;
  const hasCalendarItem = items.some((i) => i.view === "calendar");
  if (!hasCalendarItem || item.to !== "/tareas") return true;
  return item.view === "calendar" ? view === "calendar" : view !== "calendar";
}
