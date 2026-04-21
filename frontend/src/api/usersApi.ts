import { httpClient } from "./httpClient";
import type { User, UserRole } from "../types/user";

interface UsersResponse {
  users: User[];
}

export const getUsers = async (): Promise<User[]> => {
  const { data } = await httpClient.get<UsersResponse>("/api/users");
  return data.users;
};

export type InviteRole = Exclude<UserRole, "owner">;

interface InviteUserResponse {
  message: string;
  invitedUser: User;
  inviteLink?: string;
}

export const inviteUser = async (
  email: string,
  role: InviteRole,
): Promise<InviteUserResponse> => {
  const { data } = await httpClient.post<InviteUserResponse>("/api/owner/users/invite", {
    email,
    role,
  });

  return data;
};

interface OwnerPasswordLinkResponse {
  message: string;
  setupLink: string;
  expiresAt: string;
  user: User;
}

export const createOwnerPasswordLink = async (
  userId: number,
): Promise<OwnerPasswordLinkResponse> => {
  const { data } = await httpClient.post<OwnerPasswordLinkResponse>(
    `/api/owner/users/${userId}/password-link`,
  );

  return data;
};
