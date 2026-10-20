import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";
import { todayIso } from "@/lib/clock";
import { useLeadMeetings } from "@/lib/api/hooks";
import { addDaysIso } from "@/lib/api/program";
import { localDay } from "@/lib/tasks/calendar";
import { localeTag } from "@/lib/format";

const MAX_ITEMS = 5;

/** Inicio SM: entry meetings of the consultant today and tomorrow (booked by the owners from the summary email). */
export function LeadMeetingsToday() {
  const { t, i18n } = useTranslation();
  const q = useLeadMeetings();
  const tomorrow = addDaysIso(todayIso(), 1);
  const items = (q.data ?? []).filter((m) => [todayIso(), tomorrow].includes(localDay(m.meeting.starts_at)));
  if (q.isLoading || q.isError || items.length === 0) return null;
  const time = (iso: string) => new Intl.DateTimeFormat(localeTag(i18n.language), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <section className="mt-6 rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t("entry.home.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("entry.home.count", { count: items.length })}</span>
      </div>
      <ul className="divide-y divide-border">
        {items.slice(0, MAX_ITEMS).map((m) => (
          <li key={m.lead_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
              {t(localDay(m.meeting.starts_at) === todayIso() ? "entry.home.today" : "entry.home.tomorrow", { time: time(m.meeting.starts_at) })}
            </span>
            <Link to="/embudo" search={{ lead: m.lead_id }} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate font-medium">{m.business_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.owner_name} · {m.city}, {m.state}</span>
            </Link>
            <a href={m.meeting.meet_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-link hover:underline">
              <Video className="h-3.5 w-3.5" />{t("entry.meeting.join_short")}
            </a>
          </li>
        ))}
      </ul>
      {items.length > MAX_ITEMS && (
        <Link to="/embudo" search={{ stage: "meeting" }} className="block border-t border-border px-4 py-2.5 text-sm text-link hover:underline">
          {t("sm.see_all", { count: items.length })}
        </Link>
      )}
    </section>
  );
}
