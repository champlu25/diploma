import axios from "axios";
import { httpClient } from "./httpClient";
import type { AuthUser } from "../types/user";

interface AuthResponse {
  user: AuthUser;
}

export const login = async (
  email: string,
  password: string,
): Promise<AuthUser> => {
  const { data } = await httpClient.post<AuthResponse>("/api/auth/login", {
    email,
    password,
  });

  return data.user;
};

export const logout = async (): Promise<void> => {
  await httpClient.post("/api/auth/logout");
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const { data } = await httpClient.get<AuthResponse>("/api/auth/me");
    return data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }

    throw error;
  }
};
