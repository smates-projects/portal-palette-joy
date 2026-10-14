import { Home, ListChecks, Building2, BarChart3, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: "/" | "/tareas" | "/clientes" | "/reporte" | "/perfil";
  key: "home" | "tasks" | "clients" | "report" | "profile";
  icon: LucideIcon;
}

// Menu for the Partner firm role.
export const partnerFirmNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/clientes", key: "clients", icon: Building2 },
  { to: "/reporte", key: "report", icon: BarChart3 },
  { to: "/perfil", key: "profile", icon: UserRound },
];
