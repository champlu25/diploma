import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./IconButton.module.scss";

export type IconButtonTone = "default" | "neutral" | "danger";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconButtonTone;
}

export function IconButton({
  tone = "default",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        styles.button,
        tone === "neutral" && styles.neutral,
        tone === "danger" && styles.danger,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
