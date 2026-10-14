import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  Home,
  Library,
  ListChecks,
  Network,
  Settings,
  Store,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/api/types";

export type NavKey =
  | "home" | "tasks" | "clients" | "report" | "profile"
  | "calendar" | "manual" | "documents" | "numbers" | "business"
  | "network" | "businesses" | "catalog" | "settings";

export interface NavItem {
  to: "/" | "/tareas" | "/clientes" | "/reporte" | "/perfil" | "/manual" | "/documentos" | "/numeros" | "/negocio" | "/red" | "/negocios" | "/catalogo" | "/configuracion";
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

// Menu for the SM office team.
export const smNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/red", key: "network", icon: Network },
  { to: "/reporte", key: "report", icon: BarChart3 },
  { to: "/negocios", key: "businesses", icon: Building2 },
  { to: "/tareas", key: "calendar", icon: CalendarDays, view: "calendar" },
  { to: "/catalogo", key: "catalog", icon: Library },
  { to: "/configuracion", key: "settings", icon: Settings },
];

export const navFor = (role: UserRole | undefined) =>
  role === "business_owner" ? ownerNav : role === "sm_team" ? smNav : partnerFirmNav;

/** "Calendario" is active on Mis tareas in calendar view; "Mis tareas" on any other view. */
export function isNavActive(item: NavItem, items: NavItem[], pathname: string, view: unknown) {
  if (item.to === "/") return pathname === "/";
  if (!pathname.startsWith(item.to)) return false;
  const hasCalendarItem = items.some((i) => i.view === "calendar");
  if (!hasCalendarItem || item.to !== "/tareas") return true;
  return item.view === "calendar" ? view === "calendar" : view !== "calendar";
}
