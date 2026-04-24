import clsx from "clsx";
import styles from "./Divider.module.scss";

export interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return <hr className={clsx(styles.divider, className)} />;
}
