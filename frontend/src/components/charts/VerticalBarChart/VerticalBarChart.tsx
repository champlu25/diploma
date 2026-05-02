import { useMemo } from "react";
import styles from "./VerticalBarChart.module.scss";

export interface VerticalBarChartBar {
  label: string;
  value: number;
  color: string;
  title?: string;
}

export interface VerticalBarChartProps {
  bars: VerticalBarChartBar[];
  ariaLabel: string;
  emptyText?: string;
  maxBars?: number;
  height?: number;
}

const toNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function VerticalBarChart({
  bars,
  ariaLabel,
  emptyText = "Нет данных",
  maxBars = 12,
  height = 180,
}: VerticalBarChartProps) {
  const normalized = useMemo(() => {
    const cleaned = bars
      .map((bar) => ({ ...bar, value: Math.max(0, toNumber(bar.value)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.max(1, maxBars));

    const maxValue = Math.max(0, ...cleaned.map((bar) => bar.value));

    return { cleaned, maxValue };
  }, [bars, maxBars]);

  if (normalized.cleaned.length === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <div
        className={styles.chart}
        role="img"
        aria-label={ariaLabel}
        style={{ ["--h" as never]: `${height}px` }}
      >
        {normalized.cleaned.map((bar) => {
          const percent =
            normalized.maxValue > 0 ? Math.round((bar.value / normalized.maxValue) * 100) : 0;
          const title = bar.title ?? `${bar.label}: ${bar.value}`;

          return (
            <div key={bar.label} className={styles.barItem} title={title}>
              <div className={styles.value} aria-hidden="true">
                {bar.value.toLocaleString("ru-RU")}
              </div>
              <div className={styles.barTrack} aria-hidden="true">
                <div
                  className={styles.barFill}
                  style={{
                    ["--color" as never]: bar.color,
                    ["--size" as never]: `${percent}%`,
                  }}
                />
              </div>
              <div className={styles.barLabel} aria-hidden="true">
                {bar.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
