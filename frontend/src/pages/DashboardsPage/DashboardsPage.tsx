import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/user";
import { getDeals } from "../../api/dealsApi";
import { getChartViewSettings, saveChartViewSetting } from "../../api/dashboardsApi";
import type { Deal } from "../../types/deal";
import { getApiErrorMessage } from "../../utils/httpError";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Card } from "../../components/ui/Card/Card";
import { Alert } from "../../components/ui/Alert/Alert";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { InputField } from "../../components/ui/Field/Field";
import { Button } from "../../components/ui/Button/Button";
import { PieChart } from "../../components/charts/PieChart/PieChart";
import { VerticalBarChart } from "../../components/charts/VerticalBarChart/VerticalBarChart";
import styles from "./DashboardsPage.module.scss";

interface DashboardsPageProps {
  currentUser: AuthUser;
}

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];
const chartKeys = { managerCount: "manager_deals_count", managerIncome: "manager_income_rub", stageAv: "stage_av_rub", leasingAv: "leasing_av_rub" } as const;

const includesAny = (value: string, needles: string[]): boolean => {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return needles.some((needle) => normalized.includes(needle.toLocaleLowerCase("ru-RU")));
};

const includesWord = (value: string, needle: string): boolean => {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return normalized.includes(needle.toLocaleLowerCase("ru-RU"));
};

const toFiniteNumberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumberLike = (value: number): string => value.toLocaleString("ru-RU");

const formatPeriodDate = (value: string): string => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
};

const getPeriodLabel = (from: string, to: string): string => {
  const fromLabel = formatPeriodDate(from);
  const toLabel = formatPeriodDate(to);
  if (fromLabel && toLabel) return `${fromLabel} - ${toLabel}`;
  if (fromLabel) return `с ${fromLabel}`;
  if (toLabel) return `по ${toLabel}`;
  return "за весь период";
};

const startOfDay = (value: string): number | null => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
};

const endOfDay = (value: string): number | null => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
};

const deriveChartTypeIds = (chartTypes: Array<{ id: number; name: string }>) => {
  const sorted = [...chartTypes].sort((a, b) => a.id - b.id);
  const pickByExactName = (name: string) =>
    chartTypes.find((item) => item.name.trim().toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))?.id ?? null;
  const pickByNameLike = (needle: string) => chartTypes.find((item) => includesWord(item.name, needle))?.id ?? null;
  return {
    horizontalId: pickByExactName("Горизонтальный") ?? pickByNameLike("горизонт") ?? sorted[0]?.id ?? null,
    verticalId: pickByExactName("Вертикальный") ?? pickByNameLike("вертик") ?? sorted[1]?.id ?? null,
    pieId: pickByExactName("Круговой") ?? pickByNameLike("круг") ?? sorted[2]?.id ?? null,
  };
};

export function DashboardsPage({ currentUser }: DashboardsPageProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartViews, setChartViews] = useState<Record<string, number>>({});
  const [chartTypes, setChartTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [savingChartKey, setSavingChartKey] = useState<string | null>(null);
  const [managerFilters, setManagerFilters] = useState<Record<string, string>>({});
  const [lifecycleFilters, setLifecycleFilters] = useState<Record<string, string>>({});
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const loadDeals = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const data = await getDeals();
        if (!isCancelled) setDeals(data);
        try {
          const viewSettings = await getChartViewSettings();
          if (!isCancelled) {
            const nextViews: Record<string, number> = {};
            for (const setting of viewSettings.settings) nextViews[setting.chartKey] = setting.chartTypeId;
            setChartViews(nextViews);
            setChartTypes(viewSettings.chartTypes);
          }
        } catch {
          // Chart view settings are optional; the dashboard can render with defaults.
        }
      } catch (err) {
        if (!isCancelled) setError(getApiErrorMessage(err, "Не удалось загрузить сделки."));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    void loadDeals();
    return () => {
      isCancelled = true;
    };
  }, [currentUser.id]);

  const managerOptions = useMemo(
    () => Array.from(new Set(deals.map((deal) => deal.managerName))).sort((a, b) => a.localeCompare(b, "ru-RU")),
    [deals],
  );
  const showManagerFilter = currentUser.role === "owner" || currentUser.role === "group_lead";
  const lifecycleOptions = useMemo(
    () => Array.from(new Set(deals.map((deal) => deal.dealLifecycleStatusName))).sort((a, b) => a.localeCompare(b, "ru-RU")),
    [deals],
  );
  const activeLifecycleOption = useMemo(
    () => lifecycleOptions.find((status) => status === "Активные") ?? lifecycleOptions.find((status) => includesAny(status, ["актив"])) ?? lifecycleOptions[0] ?? "",
    [lifecycleOptions],
  );

  const chartTypeIds = useMemo(() => deriveChartTypeIds(chartTypes), [chartTypes]);
  const fromMs = useMemo(() => startOfDay(periodFrom), [periodFrom]);
  const toMs = useMemo(() => endOfDay(periodTo), [periodTo]);
  const periodLabel = useMemo(() => getPeriodLabel(periodFrom, periodTo), [periodFrom, periodTo]);
  const showManagerComparisonCharts = currentUser.role !== "manager";

  const periodFilteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      if (fromMs === null && toMs === null) return true;
      const source = deal.createdAt ?? deal.updatedAt ?? deal.completedAt;
      if (!source) return false;
      const ms = new Date(source).getTime();
      if (!Number.isFinite(ms)) return false;
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;
      return true;
    });
  }, [deals, fromMs, toMs]);
  const managerCountLifecycleFilter = lifecycleFilters[chartKeys.managerCount] ?? activeLifecycleOption;
  const managerIncomeLifecycleFilter = lifecycleFilters[chartKeys.managerIncome] ?? activeLifecycleOption;
  const stageAvLifecycleFilter = lifecycleFilters[chartKeys.stageAv] ?? "";
  const leasingAvLifecycleFilter = lifecycleFilters[chartKeys.leasingAv] ?? "";
  const stageAvFilter = managerFilters[chartKeys.stageAv] ?? "";
  const leasingAvFilter = managerFilters[chartKeys.leasingAv] ?? "";

  const getChartView = (chartKey: string): number | null => {
    const stored = chartViews[chartKey];
    if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) return stored;
    return chartTypeIds.horizontalId;
  };

  const setChartView = async (chartKey: string, next: number) => {
    const current = getChartView(chartKey);
    if (current === next) return;
    setChartViews((prev) => ({ ...prev, [chartKey]: next }));
    setSavingChartKey(chartKey);
    try {
      await saveChartViewSetting(chartKey, next);
    } catch (err) {
      setChartViews((prev) => {
        const nextViews = { ...prev };
        if (typeof current === "number" && Number.isFinite(current) && current > 0) nextViews[chartKey] = current;
        else delete nextViews[chartKey];
        return nextViews;
      });
      setError(getApiErrorMessage(err, "Не удалось сохранить тип графика."));
    } finally {
      setSavingChartKey((prev) => (prev === chartKey ? null : prev));
    }
  };

  const exportPdf = () => {
    const previousTitle = document.title;
    let isRestored = false;
    const restoreTitle = () => {
      if (isRestored) return;
      isRestored = true;
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    document.title = `Дашборды - ${periodLabel}`;
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 5000);
  };

  const renderChartTypeSelect = (chartKey: string) => {
    const current = getChartView(chartKey);
    const options = chartTypes.filter((item) => item.id !== current);
    return (
      <select
        className={styles.chartSelect}
        defaultValue=""
        onChange={(event) => {
          const valueRaw = event.currentTarget.value;
          event.currentTarget.value = "";
          if (!valueRaw) return;
          const value = Number(valueRaw);
          if (!Number.isFinite(value) || value <= 0) return;
          void setChartView(chartKey, value);
        }}
        disabled={isLoading || savingChartKey === chartKey || options.length === 0 || chartTypes.length === 0}
      >
        <option value="" disabled>Тип графика</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    );
  };

  const renderManagerSelect = (chartKey: string) => (
    <select
      className={styles.chartSelect}
      value={managerFilters[chartKey] ?? ""}
      onChange={(event) => setManagerFilters((prev) => ({ ...prev, [chartKey]: event.target.value }))}
      disabled={isLoading || managerOptions.length === 0}
    >
      <option value="">Все менеджеры</option>
      {managerOptions.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
    </select>
  );

  const renderLifecycleSelect = (chartKey: string, includeAllOption = true) => (
    <select
      className={styles.chartSelect}
      value={lifecycleFilters[chartKey] ?? (includeAllOption ? "" : activeLifecycleOption)}
      onChange={(event) => setLifecycleFilters((prev) => ({ ...prev, [chartKey]: event.target.value }))}
      disabled={isLoading || lifecycleOptions.length === 0}
    >
      {includeAllOption && <option value="">Все типы сделок</option>}
      {lifecycleOptions.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );

  const renderChartActions = (chartKey: string, includeManagerFilter = true, includeLifecycleFilter = true, includeAllLifecycleOption = true) => (
    <>
      {includeLifecycleFilter && renderLifecycleSelect(chartKey, includeAllLifecycleOption)}
      {includeManagerFilter && showManagerFilter && renderManagerSelect(chartKey)}
      {renderChartTypeSelect(chartKey)}
    </>
  );

  const activeDeals = useMemo(() => periodFilteredDeals.filter((deal) => includesAny(deal.dealLifecycleStatusName, ["актив"])), [periodFilteredDeals]);
  const realizedDeals = useMemo(() => periodFilteredDeals.filter((deal) => includesAny(deal.dealLifecycleStatusName, ["реализ"])), [periodFilteredDeals]);
  const delayedDeals = useMemo(() => periodFilteredDeals.filter((deal) => includesAny(deal.dealLifecycleStatusName, ["отлож"])), [periodFilteredDeals]);
  const failedDeals = useMemo(() => periodFilteredDeals.filter((deal) => includesAny(deal.dealLifecycleStatusName, ["несост"])), [periodFilteredDeals]);

  const potentialIncomeRub = useMemo(() => activeDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0), [activeDeals]);
  const earnedRub = useMemo(() => realizedDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0), [realizedDeals]);
  const delayedIncomeRub = useMemo(() => delayedDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0), [delayedDeals]);
  const missedIncomeRub = useMemo(() => failedDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0), [failedDeals]);
  const hotDealsCount = useMemo(() => activeDeals.filter((deal) => includesAny(deal.dealStatusName, ["горяч"]))?.length ?? 0, [activeDeals]);
  const coldDealsCount = useMemo(() => activeDeals.filter((deal) => includesAny(deal.dealStatusName, ["холод"]))?.length ?? 0, [activeDeals]);

  const managerCountSegments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deal of periodFilteredDeals) {
      if (managerCountLifecycleFilter && deal.dealLifecycleStatusName !== managerCountLifecycleFilter) continue;
      counts.set(deal.managerName, (counts.get(deal.managerName) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, value], index) => ({ label, value, color: COLORS[index % COLORS.length]! })).sort((a, b) => b.value - a.value);
  }, [periodFilteredDeals, managerCountLifecycleFilter]);

  const managerIncomeSegments = useMemo(() => {
    const sums = new Map<string, number>();
    for (const deal of periodFilteredDeals) {
      if (managerIncomeLifecycleFilter && deal.dealLifecycleStatusName !== managerIncomeLifecycleFilter) continue;
      sums.set(deal.managerName, (sums.get(deal.managerName) ?? 0) + toFiniteNumberOrZero(deal.advanceTotalRub));
    }
    return Array.from(sums.entries()).map(([label, value], index) => ({ label, value, color: COLORS[index % COLORS.length]! })).sort((a, b) => b.value - a.value);
  }, [periodFilteredDeals, managerIncomeLifecycleFilter]);

  const stageSegments = useMemo(() => {
    const aggregates = new Map<string, { count: number; sum: number }>();
    for (const deal of periodFilteredDeals) {
      if (stageAvFilter && deal.managerName !== stageAvFilter) continue;
      if (stageAvLifecycleFilter && deal.dealLifecycleStatusName !== stageAvLifecycleFilter) continue;
      const key = deal.dealStageName;
      const current = aggregates.get(key) ?? { count: 0, sum: 0 };
      aggregates.set(key, { count: current.count + 1, sum: current.sum + toFiniteNumberOrZero(deal.advanceTotalRub) });
    }
    return Array.from(aggregates.entries()).map(([label, { count, sum }], index) => ({ label, count, value: sum, color: COLORS[index % COLORS.length]! })).sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "ru-RU"));
  }, [periodFilteredDeals, stageAvFilter, stageAvLifecycleFilter]);

  const leasingSegments = useMemo(() => {
    const aggregates = new Map<string, { count: number; sum: number }>();
    for (const deal of periodFilteredDeals) {
      if (leasingAvFilter && deal.managerName !== leasingAvFilter) continue;
      if (leasingAvLifecycleFilter && deal.dealLifecycleStatusName !== leasingAvLifecycleFilter) continue;
      const key = deal.leasingCompanyName;
      const current = aggregates.get(key) ?? { count: 0, sum: 0 };
      aggregates.set(key, { count: current.count + 1, sum: current.sum + toFiniteNumberOrZero(deal.advanceTotalRub) });
    }
    return Array.from(aggregates.entries()).map(([label, { count, sum }], index) => ({ label, count, value: sum, color: COLORS[index % COLORS.length]! })).sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "ru-RU"));
  }, [periodFilteredDeals, leasingAvFilter, leasingAvLifecycleFilter]);

  const managerCountMax = useMemo(() => Math.max(0, ...managerCountSegments.map((s) => s.value)), [managerCountSegments]);
  const managerIncomeMax = useMemo(() => Math.max(0, ...managerIncomeSegments.map((s) => s.value)), [managerIncomeSegments]);
  const stageAvMax = useMemo(() => Math.max(0, ...stageSegments.map((s) => s.value)), [stageSegments]);
  const leasingAvMax = useMemo(() => Math.max(0, ...leasingSegments.map((s) => s.value)), [leasingSegments]);

  return (
    <div className={styles.page}>
      <div className={styles.printHeader}>
        <p>Период: {periodLabel}</p>
      </div>

      <div className={styles.headerRow}>
        <PageHeader title="Дашборды" subtitle="Сводные графики по CRM" />
        <div className={styles.dashboardControls}>
          <div className={styles.periodFilters}>
            <InputField label="С даты" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
            <InputField label="По дату" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
          </div>
          <Button type="button" variant="ghost" className={styles.exportButton} onClick={exportPdf}>
            Экспорт PDF
          </Button>
        </div>
      </div>

      {error && <Alert tone="error" className={styles.alert}>{error}</Alert>}

      <div className={styles.metricsGrid}>
        <Card title="Потенциальный доход" subtitle="По активным сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValue}>{formatNumberLike(Math.round(potentialIncomeRub))} ₽</div>}</Card>
        <Card title="Горячие сделки" subtitle="По активным сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValueHot}>{formatNumberLike(hotDealsCount)}</div>}</Card>
        <Card title="Холодные сделки" subtitle="По активным сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValueCold}>{formatNumberLike(coldDealsCount)}</div>}</Card>
        <Card title="Заработок" subtitle="По реализованным сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValue}>{formatNumberLike(Math.round(earnedRub))} ₽</div>}</Card>
        <Card title="Упущенный доход" subtitle="По несостоявшимся сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValue}>{formatNumberLike(Math.round(missedIncomeRub))} ₽</div>}</Card>
        <Card title="Доход в отложенных сделках" subtitle="По отложенным сделкам" className={styles.metricCard}>{isLoading ? <Spinner size={22} /> : <div className={styles.metricValue}>{formatNumberLike(Math.round(delayedIncomeRub))} ₽</div>}</Card>
      </div>

      <div className={styles.chartsGrid}>
        {showManagerComparisonCharts && (
          <>
            <Card title="Распределение сделок по менеджерам" subtitle="По выбранному типу сделки" className={styles.chartCard} actions={renderChartActions(chartKeys.managerCount, false, true, false)}>
              {isLoading ? <div className={styles.loading}><Spinner size={24} /><div className={styles.loadingText}>Загрузка...</div></div> : <>
                {getChartView(chartKeys.managerCount) !== chartTypeIds.verticalId && getChartView(chartKeys.managerCount) !== chartTypeIds.pieId && <div className={styles.barList}>{managerCountSegments.map((item) => <div key={item.label} className={styles.barRow}><div className={styles.barMeta}><span className={styles.barLabel}>{item.label}</span><span className={styles.barValue}>{formatNumberLike(item.value)}</span></div><div className={styles.barTrack}><div className={styles.barFill} style={{ ["--color" as never]: item.color, ["--size" as never]: `${managerCountMax > 0 ? Math.round((item.value / managerCountMax) * 100) : 0}%` }} /></div></div>)}</div>}
                {getChartView(chartKeys.managerCount) === chartTypeIds.verticalId && <VerticalBarChart ariaLabel="Сделки по менеджерам" emptyText="Сделок пока нет" bars={managerCountSegments.map((item) => ({ label: item.label, value: item.value, color: item.color, title: `${item.label}: ${formatNumberLike(item.value)}` }))} />}
                {getChartView(chartKeys.managerCount) === chartTypeIds.pieId && <PieChart ariaLabel="Сделки по менеджерам" emptyText="Сделок пока нет" segments={managerCountSegments} />}
              </>}
            </Card>

            <Card title="Сумма общего дохода АВ по менеджерам" subtitle="По выбранному типу сделки" className={styles.chartCard} actions={renderChartActions(chartKeys.managerIncome, false, true, false)}>
              {isLoading ? <div className={styles.loading}><Spinner size={24} /><div className={styles.loadingText}>Загрузка...</div></div> : <>
                {getChartView(chartKeys.managerIncome) !== chartTypeIds.verticalId && getChartView(chartKeys.managerIncome) !== chartTypeIds.pieId && <div className={styles.barList}>{managerIncomeSegments.map((item) => <div key={item.label} className={styles.barRow}><div className={styles.barMeta}><span className={styles.barLabel}>{item.label}</span><span className={styles.barValue}>{formatNumberLike(Math.round(item.value))} ₽</span></div><div className={styles.barTrack}><div className={styles.barFill} style={{ ["--color" as never]: item.color, ["--size" as never]: `${managerIncomeMax > 0 ? Math.round((item.value / managerIncomeMax) * 100) : 0}%` }} /></div></div>)}</div>}
                {getChartView(chartKeys.managerIncome) === chartTypeIds.verticalId && <VerticalBarChart ariaLabel="Доход по менеджерам" emptyText="Сделок пока нет" bars={managerIncomeSegments.map((item) => ({ label: item.label, value: item.value, color: item.color, title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽` }))} />}
                {getChartView(chartKeys.managerIncome) === chartTypeIds.pieId && <PieChart ariaLabel="Доход по менеджерам" emptyText="Сделок пока нет" segments={managerIncomeSegments} />}
              </>}
            </Card>
          </>
        )}

        <Card title="Лизинговые" subtitle="Все сделки" className={styles.chartCard} actions={renderChartActions(chartKeys.leasingAv)}>
          {isLoading ? <div className={styles.loading}><Spinner size={24} /><div className={styles.loadingText}>Загрузка...</div></div> : <>
            {getChartView(chartKeys.leasingAv) !== chartTypeIds.verticalId && getChartView(chartKeys.leasingAv) !== chartTypeIds.pieId && <div className={styles.barList}>{leasingSegments.map((item) => <div key={item.label} className={styles.barRow}><div className={styles.barMeta}><span className={styles.barLabel}>{item.label}</span><span className={styles.barValue}>{formatNumberLike(Math.round(item.value))} ₽ · {formatNumberLike(item.count)}</span></div><div className={styles.barTrack}><div className={styles.barFill} style={{ ["--color" as never]: item.color, ["--size" as never]: `${leasingAvMax > 0 ? Math.round((item.value / leasingAvMax) * 100) : 0}%` }} /></div></div>)}</div>}
            {getChartView(chartKeys.leasingAv) === chartTypeIds.verticalId && <VerticalBarChart ariaLabel="Лизинговые" emptyText="Сделок пока нет" bars={leasingSegments.map((item) => ({ label: item.label, value: item.value, color: item.color, title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽ · ${formatNumberLike(item.count)}` }))} />}
            {getChartView(chartKeys.leasingAv) === chartTypeIds.pieId && <PieChart ariaLabel="Лизинговые" emptyText="Сделок пока нет" segments={leasingSegments} />}
          </>}
        </Card>

        <Card title="Этапы сделки" subtitle="Все сделки" className={styles.chartCard} actions={renderChartActions(chartKeys.stageAv)}>
          {isLoading ? <div className={styles.loading}><Spinner size={24} /><div className={styles.loadingText}>Загрузка...</div></div> : <>
            {getChartView(chartKeys.stageAv) !== chartTypeIds.verticalId && getChartView(chartKeys.stageAv) !== chartTypeIds.pieId && <div className={styles.barList}>{stageSegments.map((item) => <div key={item.label} className={styles.barRow}><div className={styles.barMeta}><span className={styles.barLabel}>{item.label}</span><span className={styles.barValue}>{formatNumberLike(Math.round(item.value))} ₽ · {formatNumberLike(item.count)}</span></div><div className={styles.barTrack}><div className={styles.barFill} style={{ ["--color" as never]: item.color, ["--size" as never]: `${stageAvMax > 0 ? Math.round((item.value / stageAvMax) * 100) : 0}%` }} /></div></div>)}</div>}
            {getChartView(chartKeys.stageAv) === chartTypeIds.verticalId && <VerticalBarChart ariaLabel="Этапы сделки" emptyText="Сделок пока нет" bars={stageSegments.map((item) => ({ label: item.label, value: item.value, color: item.color, title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽ · ${formatNumberLike(item.count)}` }))} />}
            {getChartView(chartKeys.stageAv) === chartTypeIds.pieId && <PieChart ariaLabel="Этапы сделки" emptyText="Сделок пока нет" segments={stageSegments} />}
          </>}
        </Card>
      </div>
    </div>
  );
}
