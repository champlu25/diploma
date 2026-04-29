import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/user";
import { getDealLookups, getDeals } from "../../api/dealsApi";
import type { Deal } from "../../types/deal";
import { getApiErrorMessage } from "../../utils/httpError";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Card } from "../../components/ui/Card/Card";
import { Alert } from "../../components/ui/Alert/Alert";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { PieChart } from "../../components/charts/PieChart/PieChart";
import { TwoSegmentBarChart } from "../../components/charts/TwoSegmentBarChart/TwoSegmentBarChart";
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

export function DashboardsPage({ currentUser }: DashboardsPageProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [lookups, setLookups] = useState<{ dealLifecycleStatuses: { id: number; name: string }[] } | null>(null);
  const [selectedLifecycleStatusId, setSelectedLifecycleStatusId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const selectedLifecycleStatusName = useMemo(() => {
    if (!selectedLifecycleStatusId || !lookups) return null;
    return lookups.dealLifecycleStatuses.find((item) => item.id === selectedLifecycleStatusId)?.name ?? null;
  }, [lookups, selectedLifecycleStatusId]);

  const filteredDeals = useMemo(() => {
    if (!selectedLifecycleStatusId) return [];
    return deals.filter((deal) => deal.dealLifecycleStatusId === selectedLifecycleStatusId);
  }, [deals, selectedLifecycleStatusId]);

  const hasFilteredDeals = filteredDeals.length > 0;

  const leasingSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of filteredDeals) {
      const key = deal.leasingCompanyName;
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

  const stageSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of filteredDeals) {
      const key = deal.dealStageName;
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

  const hotColdItems = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of filteredDeals) {
      counts.set(deal.dealStatusName, (counts.get(deal.dealStatusName) ?? 0) + 1);
    }

    const byCount = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const hotKey = Array.from(counts.keys()).find((key) => includesAny(key, ["горяч"])) ?? byCount[0]?.[0] ?? "Горячие";
    const coldKey =
      Array.from(counts.keys()).find((key) => includesAny(key, ["холод"])) ??
      byCount.find(([label]) => label !== hotKey)?.[0] ??
      "Холодные";

    return [
      { label: hotKey, value: counts.get(hotKey) ?? 0, color: "#dc2626" },
      { label: coldKey, value: counts.get(coldKey) ?? 0, color: "#2563eb" },
    ] as const;
  }, [filteredDeals]);

  const totalIncomeRub = useMemo(() => {
    return filteredDeals.reduce((acc, deal) => acc + toFiniteNumberOrZero(deal.advanceTotalRub), 0);
  }, [filteredDeals]);

  const isActiveFilter = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["актив"]);
  const isRealizedFilter = selectedLifecycleStatusName !== null && includesAny(selectedLifecycleStatusName, ["реализ"]);

  return (
    <div className={styles.page}>
      <PageHeader title="Дашборды" subtitle="Сводные графики по CRM" />

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

      {error && (
        <Alert tone="error" className={styles.alert}>
          {error}
        </Alert>
      )}

      <div className={styles.grid}>
        <Card
          title="Показатели"
          subtitle={selectedLifecycleStatusName ? `Срез: ${selectedLifecycleStatusName}` : "Срез по сделкам"}
          className={`${styles.card} ${styles.fullRow}`}
        >
          {isLoading ? (
            <div className={styles.loading}>
              <Spinner size={24} />
              <div className={styles.loadingText}>Загрузка...</div>
            </div>
          ) : (
            <div className={styles.metricsRow} aria-label="Ключевые показатели">
              {isActiveFilter && (
                <div className={styles.metricBlock}>
                  <div className={styles.metricTitle}>Горячие / холодные</div>
                  <TwoSegmentBarChart
                    ariaLabel="Сравнение горячих и холодных сделок"
                    items={hotColdItems}
                    emptyText="Сделок пока нет"
                    emptyWhenTotalZero={!hasFilteredDeals}
                  />
                </div>
              )}

              <div className={styles.metricBlock}>
                <div className={styles.metricTitle}>
                  {isActiveFilter
                    ? "Прогнозируемый доход (АВ, руб.), ₽"
                    : isRealizedFilter
                      ? "Заработали (АВ, руб.), ₽"
                      : "Потенциальный доход (АВ, руб.), ₽"}
                </div>

                <div className={styles.bigNumber} aria-label="Доход">
                  {Math.round(totalIncomeRub).toLocaleString("ru-RU")}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Лизинговые" subtitle="По лизинговым компаниям" className={styles.card}>
          {isLoading ? (
            <div className={styles.loading}>
              <Spinner size={24} />
              <div className={styles.loadingText}>Загрузка...</div>
            </div>
          ) : (
            <PieChart
              ariaLabel="Круговая диаграмма по лизинговым компаниям"
              segments={leasingSegments}
              emptyText="Сделок пока нет"
            />
          )}
        </Card>

        {!isRealizedFilter && (
          <Card title="Этапы сделки" subtitle="Распределение по этапам" className={styles.card}>
            {isLoading ? (
              <div className={styles.loading}>
                <Spinner size={24} />
                <div className={styles.loadingText}>Загрузка...</div>
              </div>
            ) : (
              <PieChart
                ariaLabel="Круговая диаграмма по этапам сделки"
                segments={stageSegments}
                emptyText="Сделок пока нет"
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
