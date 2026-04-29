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
        <div className={styles.rowFull}>
          <div className={styles.rowGrid} aria-label="Ключевые показатели и менеджеры">
            <Card
              title={incomeTitle}
              subtitle={selectedLifecycleStatusName ? `Срез: ${selectedLifecycleStatusName}` : undefined}
              className={`${styles.card} ${styles.fixedCard}`}
            >
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
                <div className={styles.incomeNumber} aria-label="Доход">
                  {Math.round(totalIncomeRub).toLocaleString("ru-RU")}
                </div>
              )}
            </Card>

            <Card title="Менеджеры" subtitle="Распределение сделок" className={`${styles.card} ${styles.barCard}`}>
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
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
            </Card>

            <Card title="Менеджеры" subtitle={managerIncomeTitle} className={`${styles.card} ${styles.barCard}`}>
              {isLoading ? (
                <div className={styles.loading}>
                  <Spinner size={24} />
                  <div className={styles.loadingText}>Загрузка...</div>
                </div>
              ) : (
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
            </Card>
          </div>
        </div>

        <div className={styles.rowFull}>
          <div className={styles.rowGridPies} aria-label="Круговые диаграммы">
            {!isRealizedFilter && (
              <Card
                title="Этапы сделки"
                subtitle="Распределение по этапам"
                className={`${styles.card} ${styles.pieCard} ${styles.stagePieCard}`}
              >
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

            <Card title="Лизинговые" subtitle="По лизинговым компаниям" className={`${styles.card} ${styles.pieCard}`}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
