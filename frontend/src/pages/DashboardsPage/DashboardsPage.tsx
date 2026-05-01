import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/user";
import { getDealLookups, getDeals } from "../../api/dealsApi";
import { getChartViewSettings, saveChartViewSetting } from "../../api/dashboardsApi";
import type { Deal } from "../../types/deal";
import { getApiErrorMessage } from "../../utils/httpError";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Card } from "../../components/ui/Card/Card";
import { Alert } from "../../components/ui/Alert/Alert";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { InputField } from "../../components/ui/Field/Field";
import { PieChart } from "../../components/charts/PieChart/PieChart";
import { VerticalBarChart } from "../../components/charts/VerticalBarChart/VerticalBarChart";
import styles from "./DashboardsPage.module.scss";

interface DashboardsPageProps {
  currentUser: AuthUser;
}

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];

const includesAny = (value: string, needles: string[]): boolean => {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return needles.some((needle) => normalized.includes(needle.toLocaleLowerCase("ru-RU")));
};

const toFiniteNumberOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumberLike = (value: number): string => value.toLocaleString("ru-RU");

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const includesWord = (value: string, needle: string): boolean => {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return normalized.includes(needle.toLocaleLowerCase("ru-RU"));
};

const deriveChartTypeIds = (chartTypes: Array<{ id: number; name: string }>) => {
  const sorted = [...chartTypes].sort((a, b) => a.id - b.id);

  const pickByExactName = (name: string) =>
    chartTypes.find((item) => item.name.trim().toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))?.id ??
    null;

  const pickByNameLike = (needle: string) => chartTypes.find((item) => includesWord(item.name, needle))?.id ?? null;

  const horizontalId =
    pickByExactName("Горизонтальный") ?? pickByNameLike("горизонт") ?? sorted[0]?.id ?? null;
  const verticalId = pickByExactName("Вертикальный") ?? pickByNameLike("вертик") ?? sorted[1]?.id ?? null;
  const pieId = pickByExactName("Круговой") ?? pickByNameLike("круг") ?? sorted[2]?.id ?? null;

  // If names are unexpected, fall back to positional mapping to keep switching usable.
  const finalHorizontalId = horizontalId ?? sorted[0]?.id ?? null;
  const finalVerticalId = verticalId ?? sorted[1]?.id ?? null;
  const finalPieId = pieId ?? sorted[2]?.id ?? null;

  return { horizontalId: finalHorizontalId, verticalId: finalVerticalId, pieId: finalPieId };
};

export function DashboardsPage({ currentUser }: DashboardsPageProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [lookups, setLookups] = useState<{ dealLifecycleStatuses: { id: number; name: string }[] } | null>(null);
  const [selectedLifecycleStatusId, setSelectedLifecycleStatusId] = useState<number | null>(null);
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [chartViews, setChartViews] = useState<Record<string, number>>({});
  const [chartTypes, setChartTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [savingChartKey, setSavingChartKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadDeals = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const [data, dealLookups] = await Promise.all([getDeals(), getDealLookups()]);
        if (!isCancelled) {
          setDeals(data);
          setLookups({ dealLifecycleStatuses: dealLookups.dealLifecycleStatuses });

          const active = dealLookups.dealLifecycleStatuses.find((item) => includesAny(item.name, ["актив"]));
          setSelectedLifecycleStatusId(active?.id ?? dealLookups.dealLifecycleStatuses[0]?.id ?? null);
        }

        try {
          const viewSettings = await getChartViewSettings();
          if (!isCancelled) {
            const nextViews: Record<string, number> = {};
            for (const setting of viewSettings.settings) {
              nextViews[setting.chartKey] = setting.chartTypeId;
            }
            setChartViews(nextViews);
            setChartTypes(viewSettings.chartTypes);
          }
        } catch (settingsError) {
          if (!isCancelled) {
            console.warn("Не удалось загрузить настройки отображения графиков:", settingsError);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(getApiErrorMessage(err, "Не удалось загрузить сделки."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDeals();

    return () => {
      isCancelled = true;
    };
  }, [currentUser.id]);

  const chartTypeIds = useMemo(() => deriveChartTypeIds(chartTypes), [chartTypes]);

  const getChartView = (chartKey: string): number | null => {
    const stored = chartViews[chartKey];
    if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) return stored;
    return chartTypeIds.horizontalId;
  };

  const toPieSegments = (
    items: Array<{ label: string; value: number; color: string }>,
    maxSegments = 6,
  ) => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    if (sorted.length <= maxSegments) return sorted;

    const keep = sorted.slice(0, Math.max(1, maxSegments - 1));
    const rest = sorted.slice(keep.length);
    const restSum = rest.reduce((sum, item) => sum + toFiniteNumberOrZero(item.value), 0);

    return restSum > 0
      ? [...keep, { label: "Другое", value: restSum, color: "#94a3b8" }]
      : keep;
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
        if (typeof current === "number" && Number.isFinite(current) && current > 0) {
          nextViews[chartKey] = current;
        } else {
          delete nextViews[chartKey];
        }
        return nextViews;
      });
      setError(getApiErrorMessage(err, "Не удалось сохранить тип графика."));
    } finally {
      setSavingChartKey((prev) => (prev === chartKey ? null : prev));
    }
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
        title="Выбрать тип графика"
        aria-label="Тип графика"
      >
        <option value="" disabled>
          Тип графика
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    );
  };

  const selectedLifecycleStatusName = useMemo(() => {
    if (!selectedLifecycleStatusId || !lookups) return null;
    return lookups.dealLifecycleStatuses.find((item) => item.id === selectedLifecycleStatusId)?.name ?? null;
  }, [lookups, selectedLifecycleStatusId]);

  const period = useMemo(() => {
    const fromDate = periodFrom ? startOfDay(new Date(`${periodFrom}T00:00:00`)) : null;
    const toDate = periodTo ? endOfDay(new Date(`${periodTo}T00:00:00`)) : null;

    const fromValid = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : null;
    const toValid = toDate && Number.isFinite(toDate.getTime()) ? toDate : null;

    const labelFrom = fromValid ? periodFrom : "—";
    const labelTo = toValid ? periodTo : "—";

    const label =
      fromValid || toValid
        ? `период: ${labelFrom} – ${labelTo}`
        : "период: без фильтра";

    return { from: fromValid, to: toValid, label };
  }, [periodFrom, periodTo]);

  const filteredDeals = useMemo(() => {
    if (!selectedLifecycleStatusId) return [];

    const isRealized = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["реализ"]);
    const isFailed = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["несост"]);
    const isDelayed = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["отлож"]);

    const fromMs = period.from ? period.from.getTime() : null;
    const toMs = period.to ? period.to.getTime() : null;

    return deals
      .filter((deal) => deal.dealLifecycleStatusId === selectedLifecycleStatusId)
      .filter((deal) => {
        if (fromMs === null && toMs === null) return true;

        const timeValue =
          isRealized || isFailed
            ? deal.completedAt
            : isDelayed
              ? deal.updatedAt
              : deal.createdAt;

        if (!timeValue) return false;
        const date = new Date(timeValue);
        if (Number.isNaN(date.getTime())) return false;

        const ms = date.getTime();
        if (fromMs !== null && ms < fromMs) return false;
        if (toMs !== null && ms > toMs) return false;
        return true;
      });
  }, [deals, period.from, period.to, selectedLifecycleStatusId, selectedLifecycleStatusName]);

  const leasingSegments = useMemo(() => {
    const aggregates = new Map<string, { count: number; sum: number }>();

    for (const deal of filteredDeals) {
      const key = deal.leasingCompanyName;
      const current = aggregates.get(key) ?? { count: 0, sum: 0 };
      aggregates.set(key, {
        count: current.count + 1,
        sum: current.sum + toFiniteNumberOrZero(deal.advanceTotalRub),
      });
    }

    return Array.from(aggregates.entries())
      .map(([label, { count, sum }]) => ({
        label,
        count,
        value: sum,
      }))
      .sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "ru-RU"))
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length]!,
      }));
  }, [filteredDeals]);

  const stageSegments = useMemo(() => {
    const aggregates = new Map<string, { count: number; sum: number }>();

    for (const deal of filteredDeals) {
      const key = deal.dealStageName;
      const current = aggregates.get(key) ?? { count: 0, sum: 0 };
      aggregates.set(key, {
        count: current.count + 1,
        sum: current.sum + toFiniteNumberOrZero(deal.advanceTotalRub),
      });
    }

    return Array.from(aggregates.entries())
      .map(([label, { count, sum }]) => ({
        label,
        count,
        value: sum,
      }))
      .sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "ru-RU"))
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length]!,
      }));
  }, [filteredDeals]);

  const managerCountSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of filteredDeals) {
      const key = deal.managerName;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, value], index) => ({
        label,
        value,
        color: COLORS[index % COLORS.length]!,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredDeals]);

  const managerIncomeSegments = useMemo(() => {
    const sums = new Map<string, number>();

    for (const deal of filteredDeals) {
      const key = deal.managerName;
      sums.set(key, (sums.get(key) ?? 0) + toFiniteNumberOrZero(deal.advanceTotalRub));
    }

    return Array.from(sums.entries())
      .map(([label, value], index) => ({
        label,
        value,
        color: COLORS[index % COLORS.length]!,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredDeals]);

  const totalIncomeRub = useMemo(() => {
    return filteredDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0);
  }, [filteredDeals]);

  const isActiveFilter = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["актив"]);
  const isRealizedFilter = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["реализ"]);

  const hotColdCounts = useMemo(() => {
    let hot = 0;
    let cold = 0;

    for (const deal of filteredDeals) {
      if (includesAny(deal.dealStatusName, ["горяч"])) {
        hot += 1;
        continue;
      }

      if (includesAny(deal.dealStatusName, ["холод"])) {
        cold += 1;
      }
    }

    return { hot, cold };
  }, [filteredDeals]);

  const managerIncomeTitle = isActiveFilter
    ? "Прогноз (АВ, руб.) по менеджерам"
    : isRealizedFilter
      ? "Факт (АВ, руб.) по менеджерам"
      : "Потенциал (АВ, руб.) по менеджерам";

  const incomeTitle = isActiveFilter
    ? "Потенциальный доход (АВ, руб.), ₽"
    : isRealizedFilter
      ? "Заработали (АВ, руб.), ₽"
      : "Потенциальный доход (АВ, руб.), ₽";

  const managerCountMax = useMemo(() => Math.max(0, ...managerCountSegments.map((s) => s.value)), [managerCountSegments]);
  const managerIncomeMax = useMemo(
    () => Math.max(0, ...managerIncomeSegments.map((s) => s.value)),
    [managerIncomeSegments],
  );
  const stageAvMax = useMemo(() => Math.max(0, ...stageSegments.map((s) => s.value)), [stageSegments]);
  const leasingAvMax = useMemo(() => Math.max(0, ...leasingSegments.map((s) => s.value)), [leasingSegments]);
  const totalDealsCount = filteredDeals.length;

  const chartKeys = {
    managerCount: "manager_deals_count",
    managerIncome: "manager_income_rub",
    stageAv: "stage_av_rub",
    leasingAv: "leasing_av_rub",
  } as const;

  return (
    <div className={styles.page}>
      <PageHeader title="Дашборды" subtitle="Сводные графики по CRM" />

      <div className={styles.filtersRow} aria-label="Фильтры дашборда">
        {lookups && (
          <nav className={styles.statusNav} aria-label="Фильтр по жизненному циклу сделок">
            {lookups.dealLifecycleStatuses.map((status) => (
              <button
                key={status.id}
                type="button"
                className={`${styles.statusLink} ${status.id === selectedLifecycleStatusId ? styles.statusActive : ""}`}
                onClick={() => setSelectedLifecycleStatusId(status.id)}
                disabled={isLoading}
              >
                {status.name}
              </button>
            ))}
          </nav>
        )}

        <div className={styles.periodRow} aria-label="Фильтр по периоду">
          <InputField
            label="С даты"
            type="date"
            value={periodFrom}
            onChange={(event) => setPeriodFrom(event.target.value)}
            disabled={isLoading}
          />
          <InputField
            label="По дату"
            type="date"
            value={periodTo}
            onChange={(event) => setPeriodTo(event.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      {error && (
        <Alert tone="error" className={styles.alert}>
          {error}
        </Alert>
      )}

      <div className={styles.grid}>
        <div className={styles.rowFull}>
          <div className={styles.rowGrid} aria-label="Ключевые показатели и менеджеры">
            <Card
              title={incomeTitle}
              subtitle={
                selectedLifecycleStatusName
                  ? `Срез: ${selectedLifecycleStatusName}, ${period.label}, сделок: ${totalDealsCount}`
                  : `${period.label}, сделок: ${totalDealsCount}`
              }
              className={`${styles.card} ${styles.fixedCard}`}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <div className={styles.incomeBlock}>
                  <div className={styles.incomeNumber} aria-label="Доход">
                    {Math.round(totalIncomeRub).toLocaleString("ru-RU")}
                  </div>
                  {isActiveFilter && (
                    <div className={styles.hotColdRow} aria-label="Горячие и холодные сделки">
                      <div className={styles.hotColdItem}>
                        <span className={styles.hotColdLabel}>Горячие</span>
                        <span className={styles.hotColdValue}>{formatNumberLike(hotColdCounts.hot)}</span>
                      </div>
                      <div className={styles.hotColdItem}>
                        <span className={styles.hotColdLabel}>Холодные</span>
                        <span className={styles.hotColdValue}>{formatNumberLike(hotColdCounts.cold)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card
              title="Менеджеры"
              subtitle={`Распределение сделок (всего: ${totalDealsCount})`}
              className={`${styles.card} ${styles.barCard}`}
              actions={renderChartTypeSelect(chartKeys.managerCount)}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <>
                  {getChartView(chartKeys.managerCount) !== chartTypeIds.verticalId &&
                    getChartView(chartKeys.managerCount) !== chartTypeIds.pieId && (
                    <div className={styles.barList} aria-label="Сделки по менеджерам">
                      {managerCountSegments.length === 0 ? (
                        <div className={styles.emptyInline}>Сделок пока нет</div>
                      ) : (
                        managerCountSegments.map((item) => (
                          <div key={item.label} className={styles.barRow}>
                            <div className={styles.barMeta}>
                              <span className={styles.barLabel} title={item.label}>
                                {item.label}
                              </span>
                              <span className={styles.barValue}>{formatNumberLike(item.value)}</span>
                            </div>
                            <div className={styles.barTrack} aria-hidden="true">
                              <div
                                className={styles.barFill}
                                style={{
                                  ["--color" as never]: item.color,
                                  ["--size" as never]: `${
                                    managerCountMax > 0 ? Math.round((item.value / managerCountMax) * 100) : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {getChartView(chartKeys.managerCount) === chartTypeIds.verticalId && (
                    <VerticalBarChart
                      ariaLabel="Сделки по менеджерам"
                      emptyText="Сделок пока нет"
                      bars={managerCountSegments.map((item) => ({
                        label: item.label,
                        value: item.value,
                        color: item.color,
                        title: `${item.label}: ${formatNumberLike(item.value)}`,
                      }))}
                    />
                  )}

                  {getChartView(chartKeys.managerCount) === chartTypeIds.pieId && (
                    <PieChart
                      ariaLabel="Сделки по менеджерам (круговая диаграмма)"
                      emptyText="Сделок пока нет"
                      segments={toPieSegments(managerCountSegments)}
                    />
                  )}
                </>
              )}
            </Card>

            <Card
              title="Менеджеры"
              subtitle={`${managerIncomeTitle} (всего: ${totalDealsCount})`}
              className={`${styles.card} ${styles.barCard}`}
              actions={renderChartTypeSelect(chartKeys.managerIncome)}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <>
                  {getChartView(chartKeys.managerIncome) !== chartTypeIds.verticalId &&
                    getChartView(chartKeys.managerIncome) !== chartTypeIds.pieId && (
                    <div className={styles.barList} aria-label="Доход по менеджерам">
                      {managerIncomeSegments.length === 0 ? (
                        <div className={styles.emptyInline}>Сделок пока нет</div>
                      ) : (
                        managerIncomeSegments.map((item) => (
                          <div key={item.label} className={styles.barRow}>
                            <div className={styles.barMeta}>
                              <span className={styles.barLabel} title={item.label}>
                                {item.label}
                              </span>
                              <span className={styles.barValue}>{formatNumberLike(Math.round(item.value))}</span>
                            </div>
                            <div className={styles.barTrack} aria-hidden="true">
                              <div
                                className={styles.barFill}
                                style={{
                                  ["--color" as never]: item.color,
                                  ["--size" as never]: `${
                                    managerIncomeMax > 0 ? Math.round((item.value / managerIncomeMax) * 100) : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {getChartView(chartKeys.managerIncome) === chartTypeIds.verticalId && (
                    <VerticalBarChart
                      ariaLabel="Доход по менеджерам"
                      emptyText="Сделок пока нет"
                      bars={managerIncomeSegments.map((item) => ({
                        label: item.label,
                        value: item.value,
                        color: item.color,
                        title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽`,
                      }))}
                    />
                  )}

                  {getChartView(chartKeys.managerIncome) === chartTypeIds.pieId && (
                    <PieChart
                      ariaLabel="Доход по менеджерам (круговая диаграмма)"
                      emptyText="Сделок пока нет"
                      segments={toPieSegments(managerIncomeSegments)}
                    />
                  )}
                </>
              )}
            </Card>
          </div>
        </div>

        <div className={styles.rowFull}>
          <div className={styles.rowGridPies} aria-label="Круговые диаграммы">
            <Card
              title="Этапы сделки"
              subtitle={`АВ по этапам (всего: ${totalDealsCount})`}
              className={`${styles.card} ${styles.pieCard} ${styles.stagePieCard}`}
              actions={renderChartTypeSelect(chartKeys.stageAv)}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <>
                  {getChartView(chartKeys.stageAv) !== chartTypeIds.verticalId &&
                    getChartView(chartKeys.stageAv) !== chartTypeIds.pieId && (
                    <div className={styles.barList} aria-label="АВ по этапам сделки">
                      {stageSegments.length === 0 ? (
                        <div className={styles.emptyInline}>Сделок пока нет</div>
                      ) : (
                        stageSegments.map((item) => (
                          <div key={item.label} className={styles.barRow}>
                            <div className={styles.barMeta}>
                              <span className={styles.barLabel} title={item.label}>
                                {item.label}
                              </span>
                              <span className={styles.barValue}>
                                {formatNumberLike(Math.round(item.value))} ₽ · {formatNumberLike(item.count)} сделок
                              </span>
                            </div>
                            <div className={styles.barTrack} aria-hidden="true">
                              <div
                                className={styles.barFill}
                                style={{
                                  ["--color" as never]: item.color,
                                  ["--size" as never]: `${
                                    stageAvMax > 0 ? Math.round((item.value / stageAvMax) * 100) : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {getChartView(chartKeys.stageAv) === chartTypeIds.verticalId && (
                    <VerticalBarChart
                      ariaLabel="АВ по этапам сделки"
                      emptyText="Сделок пока нет"
                      bars={stageSegments.map((item) => ({
                        label: item.label,
                        value: item.value,
                        color: item.color,
                        title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽ · ${formatNumberLike(item.count)} сделок`,
                      }))}
                    />
                  )}

                  {getChartView(chartKeys.stageAv) === chartTypeIds.pieId && (
                    <PieChart
                      ariaLabel="АВ по этапам сделки (круговая диаграмма)"
                      emptyText="Сделок пока нет"
                      segments={stageSegments}
                    />
                  )}
                </>
              )}
            </Card>

            <Card
              title="Лизинговые"
              subtitle={`АВ по лизинговым (всего: ${totalDealsCount})`}
              className={`${styles.card} ${styles.pieCard}`}
              actions={renderChartTypeSelect(chartKeys.leasingAv)}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <>
                  {getChartView(chartKeys.leasingAv) !== chartTypeIds.verticalId &&
                    getChartView(chartKeys.leasingAv) !== chartTypeIds.pieId && (
                    <div className={styles.barList} aria-label="АВ по лизинговым компаниям">
                      {leasingSegments.length === 0 ? (
                        <div className={styles.emptyInline}>Сделок пока нет</div>
                      ) : (
                        leasingSegments.map((item) => (
                          <div key={item.label} className={styles.barRow}>
                            <div className={styles.barMeta}>
                              <span className={styles.barLabel} title={item.label}>
                                {item.label}
                              </span>
                              <span className={styles.barValue}>
                                {formatNumberLike(Math.round(item.value))} ₽ · {formatNumberLike(item.count)} сделок
                              </span>
                            </div>
                            <div className={styles.barTrack} aria-hidden="true">
                              <div
                                className={styles.barFill}
                                style={{
                                  ["--color" as never]: item.color,
                                  ["--size" as never]: `${
                                    leasingAvMax > 0 ? Math.round((item.value / leasingAvMax) * 100) : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {getChartView(chartKeys.leasingAv) === chartTypeIds.verticalId && (
                    <VerticalBarChart
                      ariaLabel="АВ по лизинговым компаниям"
                      emptyText="Сделок пока нет"
                      bars={leasingSegments.map((item) => ({
                        label: item.label,
                        value: item.value,
                        color: item.color,
                        title: `${item.label}: ${formatNumberLike(Math.round(item.value))} ₽ · ${formatNumberLike(item.count)} сделок`,
                      }))}
                    />
                  )}

                  {getChartView(chartKeys.leasingAv) === chartTypeIds.pieId && (
                    <PieChart
                      ariaLabel="АВ по лизинговым компаниям (круговая диаграмма)"
                      emptyText="Сделок пока нет"
                      segments={toPieSegments(leasingSegments)}
                    />
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
