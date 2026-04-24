import clsx from "clsx";
import styles from "./Badge.module.scss";

export interface BadgeProps {
  className?: string;
  tone?: "accent";
  children: React.ReactNode;
}

export function Badge({ className, tone = "accent", children }: BadgeProps) {
  return <span className={clsx(styles.badge, styles[tone], className)}>{children}</span>;
}
