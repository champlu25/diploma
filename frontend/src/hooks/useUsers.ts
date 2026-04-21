import { useEffect, useState } from "react";
import { getUsers } from "../api/usersApi";
import type { User } from "../types/user";

interface UseUsersResult {
  users: User[];
  isLoading: boolean;
  error: string | null;
}

export const useUsers = (): UseUsersResult => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadUsers = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const loadedUsers = await getUsers();
        if (!isCancelled) {
          setUsers(loadedUsers);
        }
      } catch {
        if (!isCancelled) {
          setError("Не удалось загрузить пользователей");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      isCancelled = true;
    };
  }, []);

  return { users, isLoading, error };
};
