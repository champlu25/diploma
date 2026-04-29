import { type FormEvent, useEffect, useState } from "react";
import { changePassword } from "../../api/authApi";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { Alert } from "../ui/Alert/Alert";
import { Button } from "../ui/Button/Button";
import { Divider } from "../ui/Divider/Divider";
import { InputField } from "../ui/Field/Field";
import { Modal } from "../ui/Modal/Modal";
import { Spinner } from "../ui/Spinner/Spinner";
import styles from "./ChangePasswordModal.module.scss";

interface ChangePasswordModalProps {
  currentUser: AuthUser;
  open: boolean;
  onClose: () => void;
  onPasswordChanged?: () => void | Promise<void>;
}

export function ChangePasswordModal({
  currentUser,
  open,
  onClose,
  onPasswordChanged,
}: ChangePasswordModalProps) {
  const [forcedMode, setForcedMode] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForcedMode(Boolean(currentUser.mustChangePassword));
      return;
    }

    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
  }, [open, currentUser.mustChangePassword]);

  const subtitle = forcedMode
    ? "Это временный пароль. Пожалуйста, задайте новый."
    : "Для смены пароля введите старый и новый.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if ((!forcedMode && !oldPassword) || !newPassword || !confirmPassword) {
      setError("Заполните все поля.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Новый пароль и подтверждение не совпадают.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await changePassword(forcedMode ? "" : oldPassword, newPassword);
      await onPasswordChanged?.();
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось изменить пароль."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} title="Смена пароля" closeable={!forcedMode} onClose={onClose}>
      <div style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
        {subtitle}
      </div>

      <Divider />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {!forcedMode && (
          <InputField
            label="Старый пароль"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            disabled={isSubmitting}
            autoComplete="current-password"
            required
          />
        )}

        <InputField
          label="Новый пароль"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          required
        />

        <InputField
          label="Повторите новый пароль"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          required
        />

        {error && <Alert tone="error">{error}</Alert>}

        <div className={styles.actions}>
          {!forcedMode && (
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Отмена
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size={22} /> : "Сохранить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
