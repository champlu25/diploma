import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Alert.module.scss";

export type AlertTone = "error" | "success" | "info";

export interface AlertProps {
  tone: AlertTone;
  className?: string;
  children: ReactNode;
}

export function Alert({ tone, className, children }: AlertProps) {
  return <div className={clsx(styles.alert, styles[tone], className)}>{children}</div>;
}
