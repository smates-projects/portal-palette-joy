// "Viendo": the office SM Global is looking at. "all" shows the whole network; otherwise the id of an SM office (or
// of Corporate, the sm_global organization). It is remembered per browser (localStorage) and read by the Global
// screens that know the office of what they list (embudo, negocios, tareas, reportes, the bell).
import { useCallback, useSyncExternalStore } from "react";

export const OFFICE_SCOPE_STORAGE_KEY = "sm.office_scope";
export const ALL_OFFICES = "all";
export type OfficeScope = typeof ALL_OFFICES | string;

const listeners = new Set<() => void>();
let current: OfficeScope | null = null;

const read = (): OfficeScope => {
  if (current !== null) return current;
  try {
    current = (typeof localStorage !== "undefined" && localStorage.getItem(OFFICE_SCOPE_STORAGE_KEY)) || ALL_OFFICES;
  } catch {
    current = ALL_OFFICES;
  }
  return current;
};

export function setOfficeScope(scope: OfficeScope) {
  current = scope || ALL_OFFICES;
  try {
    if (current === ALL_OFFICES) localStorage.removeItem(OFFICE_SCOPE_STORAGE_KEY);
    else localStorage.setItem(OFFICE_SCOPE_STORAGE_KEY, current);
  } catch {
    // Private windows or blocked storage: the choice lives in memory for this tab.
  }
  listeners.forEach((l) => l());
}

export const getOfficeScope = read;

/** Test helper: forget the cached choice (the next read goes back to storage). */
export const resetOfficeScope = () => {
  current = null;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The current scope and its setter, re-rendering every subscriber on change. On the server it is always "all". */
export function useOfficeScope(): [OfficeScope, (scope: OfficeScope) => void] {
  const scope = useSyncExternalStore(subscribe, read, () => ALL_OFFICES);
  const set = useCallback((next: OfficeScope) => setOfficeScope(next), []);
  return [scope, set];
}

/** True when the item belongs to the office in view (or everything is in view). Items without an office always show. */
export const inOfficeScope = (scope: OfficeScope, officeId: string | null | undefined) =>
  scope === ALL_OFFICES || !officeId || officeId === scope;

/** The office_id to send to a list endpoint, or undefined for the whole network. */
export const officeIdForQuery = (scope: OfficeScope) => (scope === ALL_OFFICES ? undefined : scope);
