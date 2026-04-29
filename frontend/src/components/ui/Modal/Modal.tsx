import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Icon } from "../Icon/Icon";
import styles from "./Modal.module.scss";

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeable?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  className,
  closeable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeable) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeable, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Окно"}
      onMouseDown={(event) => {
        if (!closeable) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={clsx(styles.panel, className)} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.title}>{title ?? "Окно"}</div>
          {closeable && (
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Закрыть">
              <Icon name="x" size={18} />
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}

