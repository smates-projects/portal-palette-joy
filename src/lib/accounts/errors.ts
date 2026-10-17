import type { TFunction } from "i18next";

/** Error code from the mock → sentence for the toast. Kept out of the component files for Vite's fast refresh. */
export const accountError = (t: TFunction, err: unknown) => {
  const code = err instanceof Error ? err.message : "";
  return t(`accounts.errors.${code}`, { defaultValue: t("accounts.errors.generic") });
};
