import { useMemo } from "react";
import styles from "./TwoValueBars.module.scss";

export interface TwoValueBarsItem {
  label: string;
  value: number;
  color: string;
}

export interface TwoValueBarsProps {
  items: readonly [TwoValueBarsItem, TwoValueBarsItem];
  ariaLabel: string;
  emptyText?: string;
}

export function TwoValueBars({ items, ariaLabel, emptyText = "Нет данных" }: TwoValueBarsProps) {
  const normalized = useMemo(() => {
    const cleaned = items.map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    })) as [TwoValueBarsItem, TwoValueBarsItem];

    const total = cleaned[0].value + cleaned[1].value;
    const max = Math.max(cleaned[0].value, cleaned[1].value);

    if (total <= 0) {
      return { total: 0, max: 0, items: cleaned, percents: [0, 0] as const };
    }

    const p0 = Math.round((cleaned[0].value / total) * 100);
    const p1 = 100 - p0;

    return { total, max, items: cleaned, percents: [p0, p1] as const };
  }, [items]);

  if (normalized.total === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      {normalized.items.map((item, index) => {
        const widthPercent =
          normalized.max > 0 ? Math.round((item.value / normalized.max) * 100) : 0;

        return (
          <div key={item.label} className={styles.row}>
            <div className={styles.meta}>
              <span className={styles.swatch} style={{ ["--color" as never]: item.color }} />
              <span className={styles.label}>{item.label}</span>
              <span className={styles.value}>
                {item.value} ({normalized.percents[index]}%)
              </span>
            </div>

            <div className={styles.bar} aria-hidden="true">
              <div
                className={styles.fill}
                style={{
                  ["--color" as never]: item.color,
                  ["--size" as never]: `${widthPercent}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

