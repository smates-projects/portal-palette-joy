import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFinancials } from "@/lib/api/hooks";
import type { FinancialSeries } from "@/lib/api/types";
import { formatNumber, formatUsd } from "@/lib/format";
import { readLastMonth, type MonthReading, type Trend } from "../logic";
import { EmptyState, ErrorState, formatMonth, formatMonthShort, LoadingState, PageHeader, Panel, Stat } from "../shared";

const MAX_TABLE_MONTHS = 12;
const TREND_KEY: Record<Trend, string> = { up: "up", down: "down", flat: "flat" };

/** Mis números: revenue, margin and cash by month. Private to the owner: no other role reads this series. */
export function OwnerNumbersPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const financialsQ = useFinancials();
  const series = financialsQ.data;
  const hasSeries = !!series && series.months.length > 0;
  const reading = readLastMonth(series);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.numbers.question")}>
        <p className="mt-1 text-sm text-muted-foreground">{t("owner_extra.numbers.private")}</p>
      </PageHeader>

      {financialsQ.isError ? (
        <ErrorState onRetry={() => void financialsQ.refetch()} />
      ) : financialsQ.isLoading ? (
        <LoadingState rows={3} />
      ) : !series || !hasSeries ? (
        <EmptyState title={t("owner_extra.numbers.empty_title")} hint={t("owner_extra.numbers.empty_hint")} />
      ) : (
        <div className="mt-6 space-y-4">
          {reading ? <Reading reading={reading} lng={lng} /> : null}

          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label={t("owner_extra.numbers.revenue")}
              value={formatUsd(series.revenue.at(-1) ?? 0, lng)}
              hint={formatMonth(series.months.at(-1)!, lng)}
            />
            <Stat label={t("owner_extra.numbers.margin")} value={`${series.margin_pct.at(-1) ?? 0}%`} hint={t("owner_extra.numbers.margin_hint")} />
            <Stat label={t("owner_extra.numbers.cash")} value={formatUsd(series.cash.at(-1) ?? 0, lng)} hint={t("owner_extra.numbers.cash_hint")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("owner_extra.numbers.revenue_chart")}>
              <MoneyBars series={series} values={series.revenue} lng={lng} label={t("owner_extra.numbers.revenue")} />
            </Panel>
            <Panel title={t("owner_extra.numbers.cash_chart")}>
              <MoneyBars series={series} values={series.cash} lng={lng} label={t("owner_extra.numbers.cash")} />
            </Panel>
          </div>

          <Panel title={t("owner_extra.numbers.margin_chart")}>
            <MarginLine series={series} lng={lng} label={t("owner_extra.numbers.margin")} />
          </Panel>

          <Panel title={t("owner_extra.numbers.table_title")} aside={t("owner_extra.numbers.table_hint")}>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.numbers.col_month")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("owner_extra.numbers.revenue")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("owner_extra.numbers.margin")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("owner_extra.numbers.cash")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {series.months
                    .map((month, i) => ({ month, i }))
                    .reverse()
                    .slice(0, MAX_TABLE_MONTHS)
                    .map(({ month, i }) => (
                      <tr key={month}>
                        <th scope="row" className="px-4 py-2 text-left font-normal">{formatMonth(month, lng)}</th>
                        <td className="px-4 py-2 text-right">{formatUsd(series.revenue[i] ?? 0, lng)}</td>
                        <td className="px-4 py-2 text-right">{series.margin_pct[i] ?? 0}%</td>
                        <td className="px-4 py-2 text-right">{formatUsd(series.cash[i] ?? 0, lng)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {series.changes.length > 0 && (
            <Panel title={t("owner_extra.numbers.before_now")} aside={t("owner_extra.numbers.before_now_hint")}>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.numbers.col_metric")}</th>
                      <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.numbers.col_before")}</th>
                      <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.numbers.col_now")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {series.changes.map((c) => (
                      <tr key={c.metric}>
                        <th scope="row" className="px-4 py-2 text-left font-normal">{c.metric}</th>
                        <td className="px-4 py-2 text-muted-foreground">{c.before}</td>
                        <td className="px-4 py-2 font-medium">{c.now}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

/** One plain sentence: what happened to sales and margin last month compared with the month before. */
function Reading({ reading, lng }: { reading: MonthReading; lng: string }) {
  const { t } = useTranslation();
  const values = {
    month: formatMonth(reading.lastMonth, lng),
    previous: formatMonth(reading.previousMonth, lng),
    amount: formatUsd(reading.revenue.last, lng),
    pct: Math.abs(reading.revenue.pct),
    points: Math.abs(reading.margin.points),
  };
  return (
    <section className="rounded-[4px] border border-border bg-surface p-4" aria-live="polite">
      <h2 className="text-sm font-semibold">{t("owner_extra.numbers.reading_title")}</h2>
      <p className="mt-1 text-sm">
        {t(`owner_extra.numbers.reading_revenue_${TREND_KEY[reading.revenue.trend]}`, values)}{" "}
        {t(`owner_extra.numbers.reading_margin_${TREND_KEY[reading.margin.trend]}`, values)}
      </p>
    </section>
  );
}

const axisProps = { tickLine: false, axisLine: false, fontSize: 12 } as const;

function MoneyBars({ series, values, lng, label }: { series: FinancialSeries; values: number[]; lng: string; label: string }) {
  const data = series.months.map((month, i) => ({ month, label: formatMonthShort(month, lng), value: values[i] ?? 0 }));
  return (
    <div className="h-56 px-2 pb-3" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis
            {...axisProps}
            width={56}
            tickFormatter={(v: number) => formatNumber(v, lng, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })}
          />
          <Tooltip cursor={false} formatter={(v: number) => [formatUsd(v, lng), label]} labelFormatter={(_, p) => formatMonth(p[0]?.payload.month ?? "", lng)} />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {/* Last month in gold (accent), the rest in institutional blue. */}
            {data.map((d, i) => (
              <Cell key={d.month} className={i === data.length - 1 ? "fill-gold" : "fill-primary"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarginLine({ series, lng, label }: { series: FinancialSeries; lng: string; label: string }) {
  const data = series.months.map((month, i) => ({ month, label: formatMonthShort(month, lng), value: series.margin_pct[i] ?? 0 }));
  return (
    <div className="h-48 px-2 pb-3" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip cursor={false} formatter={(v: number) => [`${v}%`, label]} labelFormatter={(_, p) => formatMonth(p[0]?.payload.month ?? "", lng)} />
          <Line dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 3, className: "fill-primary stroke-primary" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
