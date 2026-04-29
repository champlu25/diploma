import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../../api/authApi";
import type { AuthUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField } from "../../components/ui/Field/Field";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./ChangePasswordPage.module.scss";

interface ChangePasswordPageProps {
  currentUser: AuthUser;
  onPasswordChanged?: () => void | Promise<void>;
}

export function ChangePasswordPage({ currentUser, onPasswordChanged }: ChangePasswordPageProps) {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mustChange = Boolean(currentUser.mustChangePassword);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if ((!mustChange && !oldPassword) || !newPassword || !confirmPassword) {
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

      await changePassword(mustChange ? "" : oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await onPasswordChanged?.();

      if (mustChange) {
        navigate("/", { replace: true });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось изменить пароль."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Смена пароля</h1>
            <p className={styles.subtitle}>
              {mustChange
                ? "Это временный пароль. Пожалуйста, задайте новый."
                : "Для смены пароля введите старый и новый."}
            </p>
          </div>

          <Divider />

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {!mustChange && (
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

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? <Spinner size={22} /> : "Сохранить"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
