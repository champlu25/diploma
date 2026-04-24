import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Card.module.scss";

export interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, actions, className, children }: CardProps) {
  return (
    <section className={clsx(styles.card, className)}>
      {(title || subtitle || actions) && (
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            {title && <h1 className={styles.title}>{title}</h1>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
