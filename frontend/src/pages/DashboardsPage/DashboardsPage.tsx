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
import { TwoValueBars } from "../../components/charts/TwoValueBars/TwoValueBars";
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

const DEAL_STATUS_COLORS: Record<string, string> = {
  Горячая: "#dc2626",
  Холодная: "#2563eb",
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

  const temperatureItems = useMemo(() => {
    const counts = new Map<string, number>();

    for (const deal of deals) {
      const key = deal.dealStatusName;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const hot = counts.get("Горячая") ?? 0;
    const cold = counts.get("Холодная") ?? 0;

    return [
      { label: "Горячая", value: hot, color: DEAL_STATUS_COLORS["Горячая"]! },
      { label: "Холодная", value: cold, color: DEAL_STATUS_COLORS["Холодная"]! },
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
          title="Статусы сделок"
          subtitle="По статусам жизненного цикла"
          className={styles.card}
        >
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
        <Card title="Горячие / холодные" subtitle="По статусу сделки" className={styles.card}>
          {isLoading ? (
            <div className={styles.loading}>
              <Spinner size={24} />
              <div className={styles.loadingText}>Загрузка...</div>
            </div>
          ) : (
            <TwoValueBars
              ariaLabel="Сравнение горячих и холодных сделок"
              items={temperatureItems}
              emptyText="Сделок пока нет"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
