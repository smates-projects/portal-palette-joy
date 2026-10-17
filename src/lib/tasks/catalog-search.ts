// Search params of Catálogo y equipo (/catalogo). Kept out of the component file so that Vite's fast refresh
// keeps working (a component file must export only components).
export type CatalogTab = "catalog" | "firms" | "team";
export interface CatalogSearch { tab?: CatalogTab | undefined; q?: string | undefined }

export const validateCatalogSearch = (raw: Record<string, unknown>): CatalogSearch => {
  const s: CatalogSearch = {};
  if (raw["tab"] === "firms" || raw["tab"] === "team") s.tab = raw["tab"];
  if (typeof raw["q"] === "string" && raw["q"]) s.q = raw["q"];
  return s;
};
