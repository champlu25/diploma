import { useMemo } from "react";
import styles from "./HotColdSummary.module.scss";

export interface HotColdSummaryItem {
  label: string;
  value: number;
  color: string;
}

export interface HotColdSummaryProps {
  items: readonly [HotColdSummaryItem, HotColdSummaryItem];
  ariaLabel: string;
  emptyText?: string;
}

export function HotColdSummary({ items, ariaLabel, emptyText = "Нет данных" }: HotColdSummaryProps) {
  const normalized = useMemo(() => {
    const cleaned = items.map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    })) as [HotColdSummaryItem, HotColdSummaryItem];

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
      <div className={styles.tiles}>
        {normalized.items.map((item, index) => (
          <div
            key={item.label}
            className={styles.tile}
            style={{ ["--accent" as never]: item.color }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.swatch} />
              <span className={styles.label}>{item.label}</span>
              <span className={styles.percent}>{normalized.percents[index]}%</span>
            </div>
            <div className={styles.value}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.bar} role="img" aria-label={ariaLabel}>
        <div
          className={styles.segment}
          style={{
            ["--color" as never]: normalized.items[0].color,
            ["--size" as never]: `${normalized.percents[0]}%`,
          }}
        />
        <div
          className={styles.segment}
          style={{
            ["--color" as never]: normalized.items[1].color,
            ["--size" as never]: `${normalized.percents[1]}%`,
          }}
        />
      </div>
    </div>
  );
}

