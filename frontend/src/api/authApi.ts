import axios from "axios";
import { httpClient } from "./httpClient";
import type { CurrentUser } from "../types/user";

interface AuthResponse {
  user: CurrentUser;
}

export const login = async (
  username: string,
  password: string,
): Promise<CurrentUser> => {
  const { data } = await httpClient.post<AuthResponse>("/api/auth/login", {
    username,
    password,
  });

  return data.user;
};

export const logout = async (): Promise<void> => {
  await httpClient.post("/api/auth/logout");
};

export const getCurrentUser = async (): Promise<CurrentUser | null> => {
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

export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  await httpClient.post("/api/auth/change-password", { oldPassword, newPassword });
};

export const updateCurrentUserProfile = async (params: {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
}): Promise<CurrentUser> => {
  const { data } = await httpClient.patch<AuthResponse>("/api/auth/me", params);
  return data.user;
};
