import type { ComponentPropsWithoutRef, ReactNode } from "react";
import clsx from "clsx";
import styles from "./DataTable.module.scss";

export interface DataTableProps {
  className?: string;
  children: ReactNode;
}

export function DataTable({ className, children }: DataTableProps) {
  return (
    <div className={clsx(styles.wrap, className)}>
      <table className={styles.table}>{children}</table>
    </div>
  );
}

export type ThProps = ComponentPropsWithoutRef<"th">;
export type TdProps = ComponentPropsWithoutRef<"td">;

export function Th({ className, children, ...rest }: ThProps) {
  return (
    <th className={clsx(styles.th, className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...rest }: TdProps) {
  return (
    <td className={clsx(styles.td, className)} {...rest}>
      {children}
    </td>
  );
}

export interface DataTableRowProps {
  className?: string;
  children: ReactNode;
}

export function Tr({ className, children }: DataTableRowProps) {
  return <tr className={clsx(styles.row, className)}>{children}</tr>;
}
