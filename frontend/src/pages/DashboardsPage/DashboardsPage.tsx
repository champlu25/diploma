import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/user";
import { getDeals } from "../../api/dealsApi";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadDeals = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const data = await getDeals();
        if (!isCancelled) {
          setDeals(data);
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

  const hasDeals = deals.length > 0;

  const lifecycleSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of deals) {
      const key = deal.dealLifecycleStatusName;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, value], index) => ({
        label,
        value,
        color: COLORS[index % COLORS.length]!,
      }))
      .sort((a, b) => b.value - a.value);
  }, [deals]);

  const leasingSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of deals) {
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
  }, [deals]);

  const stageSegments = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of deals) {
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
  }, [deals]);

  const hotColdItems = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of deals) {
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
  }, [deals]);

  const incomeItems = useMemo(() => {
    let predictedIncomeRub = 0;
    let actualIncomeRub = 0;

    for (const deal of deals) {
      const income = toFiniteNumberOrZero(deal.advanceTotalRub);
      if (includesAny(deal.dealLifecycleStatusName, ["актив"])) {
        predictedIncomeRub += income;
      }
      if (includesAny(deal.dealLifecycleStatusName, ["реализ"])) {
        actualIncomeRub += income;
      }
    }

    return [
      { label: "Прогноз (Активные)", value: predictedIncomeRub, color: "#f59e0b" },
      { label: "Факт (Реализованные)", value: actualIncomeRub, color: "#16a34a" },
    ] as const;
  }, [deals]);

  return (
    <div className={styles.page}>
      <PageHeader title="Дашборды" subtitle="Сводные графики по CRM" />

      {error && (
        <Alert tone="error" className={styles.alert}>
          {error}
        </Alert>
      )}

      <div className={styles.grid}>
        <Card
          title="Показатели"
          subtitle="Горячие/холодные и доход (АВ, руб.)"
          className={`${styles.card} ${styles.fullRow}`}
        >
          {isLoading ? (
            <div className={styles.loading}>
              <Spinner size={24} />
              <div className={styles.loadingText}>Загрузка...</div>
            </div>
          ) : (
            <div className={styles.metricsRow} aria-label="Ключевые показатели">
              <div className={styles.metricBlock}>
                <div className={styles.metricTitle}>Горячие / холодные</div>
                <TwoSegmentBarChart
                  ariaLabel="Сравнение горячих и холодных сделок"
                  items={hotColdItems}
                  emptyText="Сделок пока нет"
                />
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricTitle}>Доход (АВ, руб.), ₽</div>
                <TwoSegmentBarChart
                  ariaLabel="Сравнение прогнозируемого и фактического дохода"
                  items={incomeItems}
                  emptyText="Сделок пока нет"
                  emptyWhenTotalZero={!hasDeals}
                />
              </div>
            </div>
          )}
        </Card>

        <Card title="Статусы сделок" subtitle="По статусам жизненного цикла" className={styles.card}>
          {isLoading ? (
            <div className={styles.loading}>
              <Spinner size={24} />
              <div className={styles.loadingText}>Загрузка...</div>
            </div>
          ) : (
            <PieChart
              ariaLabel="Круговая диаграмма по статусам сделок"
              segments={lifecycleSegments}
              emptyText="Сделок пока нет"
            />
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
      </div>
    </div>
  );
}
