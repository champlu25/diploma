import axios from "axios";
import { API_ROUTES } from "../constants/api";
import type { CurrentUser } from "../types/user";
import { httpClient } from "./httpClient";

interface AuthResponse {
  user: CurrentUser;
}

export const login = async (username: string, password: string): Promise<CurrentUser> => {
  const { data } = await httpClient.post<AuthResponse>(API_ROUTES.authLogin, {
    username,
    password,
  });

  return data.user;
};

export const logout = async (): Promise<void> => {
  await httpClient.post(API_ROUTES.authLogout);
};

export const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    const { data } = await httpClient.get<AuthResponse>(API_ROUTES.authMe);
    return data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }

    throw error;
  }
};

export const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  await httpClient.post(API_ROUTES.authChangePassword, { oldPassword, newPassword });
};

export const updateCurrentUserProfile = async (params: {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
}): Promise<CurrentUser> => {
  const { data } = await httpClient.patch<AuthResponse>(API_ROUTES.authMe, params);
  return data.user;
};
