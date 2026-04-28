import { useMemo } from "react";
import styles from "./PieChart.module.scss";

export interface PieChartSegment {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  segments: PieChartSegment[];
  ariaLabel: string;
  emptyText?: string;
  size?: number;
  strokeWidth?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const delta = Math.abs(endAngle - startAngle);
  const largeArcFlag = delta > 180 ? 1 : 0;

  return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
};

export function PieChart({
  segments,
  ariaLabel,
  emptyText = "Нет данных",
  size = 220,
  strokeWidth = 34,
}: PieChartProps) {
  const normalized = useMemo(() => {
    const cleaned = segments
      .filter((segment) => Number.isFinite(segment.value) && segment.value > 0)
      .map((segment) => ({
        ...segment,
        value: Number(segment.value),
      }));

    const total = cleaned.reduce((sum, segment) => sum + segment.value, 0);

    if (total <= 0) {
      return { total: 0, slices: [] as Array<PieChartSegment & { start: number; end: number }> };
    }

    let cursor = 0;
    const slices = cleaned.map((segment) => {
      const portion = segment.value / total;
      const start = cursor * 360;
      cursor += portion;
      const end = clamp(cursor * 360, 0, 360);
      return { ...segment, start, end };
    });

    return { total, slices };
  }, [segments]);

  if (normalized.total === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  const center = size / 2;
  const radius = center - strokeWidth / 2 - 2;

  return (
    <div className={styles.root}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className={styles.svg}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          className={styles.track}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {normalized.slices.map((slice) => (
          <path
            key={slice.label}
            d={describeArc(center, center, radius, slice.start, slice.end)}
            stroke={slice.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
      </svg>

      <div className={styles.legend} aria-label="Легенда диаграммы">
        {normalized.slices.map((slice) => {
          const percent = Math.round((slice.value / normalized.total) * 100);
          return (
            <div key={slice.label} className={styles.legendRow}>
              <span className={styles.swatch} style={{ ["--color" as never]: slice.color }} />
              <span className={styles.text}>
                <span className={styles.label}>{slice.label}</span>
                <span className={styles.value}>
                  {slice.value} ({percent}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
