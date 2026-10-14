import raw from "@/data/catalogo_metodo180.json";
import { AREA_BY_KEY, type CatalogEntry } from "./program";
import type { AreaCode } from "./types";

export interface CatalogItem extends CatalogEntry {
  area_code: AreaCode;
}

/** Official Método 180 catalog, read-only (only SM Global edits it). Later served by the API. */
export async function listCatalog(): Promise<CatalogItem[]> {
  return (raw as CatalogEntry[]).map((e) => ({ ...e, area_code: AREA_BY_KEY[e.area] ?? "B1" }));
}
