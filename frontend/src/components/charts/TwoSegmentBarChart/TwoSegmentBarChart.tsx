import { useMemo } from "react";
import styles from "./TwoSegmentBarChart.module.scss";

export interface TwoSegmentBarItem {
  label: string;
  value: number;
  color: string;
}

export interface TwoSegmentBarChartProps {
  items: readonly [TwoSegmentBarItem, TwoSegmentBarItem];
  ariaLabel: string;
  emptyText?: string;
}

export function TwoSegmentBarChart({
  items,
  ariaLabel,
  emptyText = "Нет данных",
}: TwoSegmentBarChartProps) {
  const normalized = useMemo(() => {
    const cleaned = items.map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    })) as [TwoSegmentBarItem, TwoSegmentBarItem];

    const total = cleaned[0].value + cleaned[1].value;
    if (total <= 0) {
      return { total: 0, items: cleaned, percents: [0, 0] as const };
    }

    const p0 = Math.round((cleaned[0].value / total) * 100);
    const p1 = 100 - p0;
    return { total, items: cleaned, percents: [p0, p1] as const };
  }, [items]);

  if (normalized.total === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <div className={styles.bar} role="img" aria-label={ariaLabel}>
        <div
          className={styles.segment}
          style={{
            ["--color" as never]: normalized.items[0].color,
            ["--size" as never]: `${normalized.percents[0]}%`,
          }}
          title={`${normalized.items[0].label}: ${normalized.items[0].value} (${normalized.percents[0]}%)`}
        />
        <div
          className={styles.segment}
          style={{
            ["--color" as never]: normalized.items[1].color,
            ["--size" as never]: `${normalized.percents[1]}%`,
          }}
          title={`${normalized.items[1].label}: ${normalized.items[1].value} (${normalized.percents[1]}%)`}
        />
      </div>

      <div className={styles.legend} aria-label="Легенда графика">
        {normalized.items.map((item, index) => (
          <div key={item.label} className={styles.legendRow}>
            <span className={styles.swatch} style={{ ["--color" as never]: item.color }} />
            <span className={styles.text}>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.value}>
                {item.value} ({normalized.percents[index]}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
