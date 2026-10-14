import { ScreenPlaceholder } from "@/components/soon/ScreenPlaceholder";

/** Placeholder: replace with the real screen. Office detail (route /oficinas/$officeId). Hooks: useOffice(officeId). */
export function OfficeDetailPage({ officeId }: { officeId: string }) {
  void officeId;
  return <ScreenPlaceholder ns="global" screen="office_detail" />;
}

