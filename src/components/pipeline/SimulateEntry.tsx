import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { useCurrentUser, useOrganizations, useSimulateAssessment, useSimulateBooking } from "@/lib/api/hooks";
import type { LeadWithComputed } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Demo only, SM team: what the landing and the consultant's calendar will send by themselves in production.
 * "Simular reserva" books the open lead if it is in Evaluado, otherwise the newest evaluated lead without a meeting.
 */
export function SimulateEntry({ leads, selectedId, onOpen }: { leads: LeadWithComputed[]; selectedId: string | undefined; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser().data;
  const orgs = useOrganizations().data ?? [];
  const assessment = useSimulateAssessment();
  const booking = useSimulateBooking();
  if (me?.role !== "sm_team") return null;

  const fail = () => toast.error(t("pipeline.t_error"));
  const evaluated = leads.filter((l) => l.stage === "evaluated" && !l.meeting).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const target = leads.find((l) => l.id === selectedId && l.stage === "evaluated") ?? evaluated[0];

  const simulateAssessment = () =>
    assessment.mutate(undefined, {
      onSuccess: (l) => {
        const place = `${l.contact.city}, ${l.contact.state}`;
        const office = orgs.find((o) => o.id === l.office_id)?.name ?? "";
        const mine = l.office_id === me.organization_id;
        toast.success(t(mine ? "entry.sim.t_assessment" : "entry.sim.t_other_office", { name: l.business.name, place, office }), {
          action: mine ? { label: t("entry.sim.open"), onClick: () => onOpen(l.id) } : undefined,
        });
      },
      onError: fail,
    });
  const simulateBooking = () => {
    if (!target) {
      toast.error(t("entry.sim.no_evaluated"));
      return;
    }
    booking.mutate(target.id, {
      onSuccess: (l) =>
        toast.success(t("entry.sim.t_booking", { owner: l.contact.name, date: l.meeting ? formatDateTime(l.meeting.starts_at, i18n.language) : "" }), {
          action: { label: t("entry.sim.open"), onClick: () => onOpen(l.id) },
        }),
      onError: fail,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        <FlaskConical className="h-3.5 w-3.5" />{t("entry.sim.button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("entry.sim.hint")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={assessment.isPending} onSelect={simulateAssessment}>{t("entry.sim.assessment")}</DropdownMenuItem>
        <DropdownMenuItem disabled={booking.isPending || !target} onSelect={simulateBooking}>
          <span className="min-w-0">
            <span className="block">{t("entry.sim.booking")}</span>
            <span className="block truncate text-xs text-muted-foreground">{target ? t("entry.sim.booking_for", { name: target.business.name }) : t("entry.sim.no_evaluated")}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
