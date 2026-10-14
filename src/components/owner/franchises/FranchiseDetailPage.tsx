import { ScreenPlaceholder } from "@/components/soon/ScreenPlaceholder";

/** Placeholder: replace with the real screen. Franchise detail (route /franquicias/$franchiseId). Hooks: useFranchise(franchiseId). */
export function FranchiseDetailPage({ franchiseId }: { franchiseId: string }) {
  void franchiseId;
  return <ScreenPlaceholder ns="owner_extra" screen="franchise_detail" />;
}

