import { useMemo } from "react";
import styles from "./HotColdWaffle.module.scss";

export interface HotColdWaffleItem {
  label: string;
  value: number;
  color: string;
}

export interface HotColdWaffleProps {
  items: readonly [HotColdWaffleItem, HotColdWaffleItem];
  ariaLabel: string;
  emptyText?: string;
  cells?: number;
}

export function HotColdWaffle({
  items,
  ariaLabel,
  emptyText = "Нет данных",
  cells = 100,
}: HotColdWaffleProps) {
  const normalized = useMemo(() => {
    const cleaned = items.map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    })) as [HotColdWaffleItem, HotColdWaffleItem];

    const total = cleaned[0].value + cleaned[1].value;
    if (total <= 0) {
      return { total: 0, items: cleaned, hotCells: 0, percents: [0, 0] as const };
    }

    const hotPercent = Math.round((cleaned[0].value / total) * 100);
    const coldPercent = 100 - hotPercent;
    const hotCells = Math.round((hotPercent / 100) * cells);

    return {
      total,
      items: cleaned,
      hotCells,
      percents: [hotPercent, coldPercent] as const,
    };
  }, [items, cells]);

  if (normalized.total === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  const grid = Array.from({ length: cells }, (_, index) => index < normalized.hotCells);

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <div className={styles.header}>
        <div className={styles.metric} style={{ ["--accent" as never]: normalized.items[0].color }}>
          <div className={styles.metricLabel}>{normalized.items[0].label}</div>
          <div className={styles.metricValue}>{normalized.items[0].value}</div>
          <div className={styles.metricHint}>{normalized.percents[0]}%</div>
        </div>
        <div className={styles.metric} style={{ ["--accent" as never]: normalized.items[1].color }}>
          <div className={styles.metricLabel}>{normalized.items[1].label}</div>
          <div className={styles.metricValue}>{normalized.items[1].value}</div>
          <div className={styles.metricHint}>{normalized.percents[1]}%</div>
        </div>
      </div>

      <div className={styles.waffle} role="img" aria-label={ariaLabel}>
        {grid.map((isHot, index) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={styles.cell}
            style={{
              ["--color" as never]: isHot ? normalized.items[0].color : normalized.items[1].color,
            }}
          />
        ))}
      </div>

      <div className={styles.note}>Каждая клетка = {Math.max(1, Math.round(normalized.total / cells))} сделка</div>
    </div>
  );
}

