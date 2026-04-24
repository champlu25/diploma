import clsx from "clsx";
import styles from "./Spinner.module.scss";

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 22, className }: SpinnerProps) {
  return (
    <span
      className={clsx(styles.spinner, className)}
      style={{ ["--size" as never]: `${size}px` }}
    />
  );
}
