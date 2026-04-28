import { useMemo } from "react";
import styles from "./HotColdThermometer.module.scss";

export interface HotColdThermometerItem {
  label: string;
  value: number;
  color: string;
}

export interface HotColdThermometerProps {
  items: readonly [HotColdThermometerItem, HotColdThermometerItem];
  ariaLabel: string;
  emptyText?: string;
}

export function HotColdThermometer({
  items,
  ariaLabel,
  emptyText = "Нет данных",
}: HotColdThermometerProps) {
  const normalized = useMemo(() => {
    const cleaned = items.map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    })) as [HotColdThermometerItem, HotColdThermometerItem];

    const total = cleaned[0].value + cleaned[1].value;
    if (total <= 0) {
      return { total: 0, items: cleaned, hotPercent: 0, coldPercent: 0 };
    }

    const hotPercent = Math.round((cleaned[0].value / total) * 100);
    const coldPercent = 100 - hotPercent;
    return { total, items: cleaned, hotPercent, coldPercent };
  }, [items]);

  if (normalized.total === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <div className={styles.header}>
        <div className={styles.side}>
          <span className={styles.badge} style={{ ["--accent" as never]: normalized.items[1].color }}>
            {normalized.items[1].label}
          </span>
          <span className={styles.count}>
            {normalized.items[1].value} ({normalized.coldPercent}%)
          </span>
        </div>

        <div className={styles.center}>
          <div className={styles.totalLabel}>Всего</div>
          <div className={styles.totalValue}>{normalized.total}</div>
        </div>

        <div className={styles.side}>
          <span className={styles.badge} style={{ ["--accent" as never]: normalized.items[0].color }}>
            {normalized.items[0].label}
          </span>
          <span className={styles.count}>
            {normalized.items[0].value} ({normalized.hotPercent}%)
          </span>
        </div>
      </div>

      <div className={styles.track} role="img" aria-label={ariaLabel}>
        <div className={styles.gradient} />
        <div className={styles.mid} aria-hidden="true" />
        <div
          className={styles.marker}
          style={{ ["--pos" as never]: `${normalized.hotPercent}%` }}
          title={`${normalized.items[0].label}: ${normalized.hotPercent}%`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

