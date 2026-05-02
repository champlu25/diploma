import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../../api/authApi";
import type { CurrentUser } from "../../types/user";
import { getApiErrorMessage } from "../../utils/httpError";
import { Alert } from "../../components/ui/Alert/Alert";
import { Button } from "../../components/ui/Button/Button";
import { Card } from "../../components/ui/Card/Card";
import { Divider } from "../../components/ui/Divider/Divider";
import { InputField } from "../../components/ui/Field/Field";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import styles from "./LoginPage.module.scss";

interface LoginPageProps {
  onLogin: (user: CurrentUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("Введите логин и пароль.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const user = await login(username.trim(), password);
      onLogin(user);
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Не удалось выполнить вход."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Card>
          <div className={styles.header}>
            <h1 className={styles.title}>Вход</h1>
            <p className={styles.subtitle}>Введите логин и пароль.</p>
          </div>

          <Divider />

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <InputField
              label="Логин"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="например: ivanov"
              disabled={isSubmitting}
              required
            />

            <InputField
              label="Пароль"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? <Spinner size={22} /> : "Войти"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
