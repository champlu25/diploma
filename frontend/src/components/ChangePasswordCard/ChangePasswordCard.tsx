import { type FormEvent, useState } from "react";
import { changePassword } from "../../api/authApi";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { Alert } from "../ui/Alert/Alert";
import { Button } from "../ui/Button/Button";
import { Card } from "../ui/Card/Card";
import { Divider } from "../ui/Divider/Divider";
import { InputField } from "../ui/Field/Field";
import { Spinner } from "../ui/Spinner/Spinner";
import styles from "./ChangePasswordCard.module.scss";

interface ChangePasswordCardProps {
  currentUser: AuthUser;
  onPasswordChanged?: () => void;
}

export function ChangePasswordCard({
  currentUser,
  onPasswordChanged,
}: ChangePasswordCardProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const subtitle = currentUser.mustChangePassword
    ? "Это временный пароль. Пожалуйста, задайте новый."
    : "Для смены пароля введите старый и новый.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!oldPassword || !newPassword || !confirmPassword) {
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
      setSuccess(null);

      await changePassword(oldPassword, newPassword);
      setSuccess("Пароль изменён.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onPasswordChanged?.();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось изменить пароль."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card title="Пароль" subtitle={subtitle} className={styles.card}>
      <Divider />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <InputField
          label="Старый пароль"
          type="password"
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
          disabled={isSubmitting}
          autoComplete="current-password"
          required
        />

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
        {success && <Alert tone="success">{success}</Alert>}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner size={22} /> : "Сохранить"}
        </Button>
      </form>
    </Card>
  );
}

