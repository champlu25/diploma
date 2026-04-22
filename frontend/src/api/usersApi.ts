import { httpClient } from "./httpClient";
import type { User, UserRole } from "../types/user";

interface UserDto {
  id: number;
  email: string;
  role: UserRole;
  group_lead_user_id?: number | null;
  group_lead_email?: string | null;
}

interface UsersResponse {
  users: UserDto[];
}

const toUser = (dto: UserDto): User => ({
  id: dto.id,
  email: dto.email,
  role: dto.role,
  groupLeadUserId: dto.group_lead_user_id ?? null,
  groupLeadEmail: dto.group_lead_email ?? null,
});

export const getUsers = async (): Promise<User[]> => {
  const { data } = await httpClient.get<UsersResponse>("/api/users");
  return data.users.map(toUser);
};

export type InviteRole = Exclude<UserRole, "owner">;

interface InviteUserResponse {
  message: string;
  invitedUser: User;
  inviteLink?: string;
}

interface InviteUserDtoResponse {
  message: string;
  invitedUser: UserDto;
  inviteLink?: string;
}

export const inviteUser = async (
  email: string,
  role: InviteRole,
  groupLeadUserId: number | null = null,
): Promise<InviteUserResponse> => {
  const { data } = await httpClient.post<InviteUserDtoResponse>("/api/owner/users/invite", {
    email,
    role,
    groupLeadUserId,
  });

  return {
    ...data,
    invitedUser: toUser(data.invitedUser),
  };
};

interface AssignGroupLeadResponse {
  message: string;
  user: User;
}

interface AssignGroupLeadDtoResponse {
  message: string;
  user: UserDto;
}

export const assignManagerToGroupLead = async (
  userId: number,
  groupLeadUserId: number | null,
): Promise<AssignGroupLeadResponse> => {
  const { data } = await httpClient.patch<AssignGroupLeadDtoResponse>(
    `/api/owner/users/${userId}/group-lead`,
    { groupLeadUserId },
  );

  return {
    ...data,
    user: toUser(data.user),
  };
};

interface GroupManagerDto {
  id: number;
  email: string;
  companies_count: number;
}

export interface GroupManager {
  id: number;
  email: string;
  companiesCount: number;
}

interface GroupManagersResponse {
  managers: GroupManagerDto[];
}

export const getGroupLeadManagers = async (): Promise<GroupManager[]> => {
  const { data } = await httpClient.get<GroupManagersResponse>("/api/group-lead/managers");
  return data.managers.map((manager) => ({
    id: manager.id,
    email: manager.email,
    companiesCount: manager.companies_count,
  }));
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
