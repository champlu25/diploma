import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./PageHeader.module.scss";

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
  return (
    <header className={clsx(styles.header, className)}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
