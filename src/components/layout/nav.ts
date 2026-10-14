import { Home, ListChecks, Building2, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: "/" | "/tareas" | "/clientes" | "/perfil";
  key: "home" | "tasks" | "clients" | "profile";
  icon: LucideIcon;
}

// Menu for the Partner firm role.
export const partnerFirmNav: NavItem[] = [
  { to: "/", key: "home", icon: Home },
  { to: "/tareas", key: "tasks", icon: ListChecks },
  { to: "/clientes", key: "clients", icon: Building2 },
  { to: "/perfil", key: "profile", icon: UserRound },
];
