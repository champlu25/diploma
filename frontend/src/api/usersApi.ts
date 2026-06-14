import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";
import type { User, UserRole } from "../types/user";

interface UserDto {
  id: number;
  username: string;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  role: UserRole;
  group_lead_user_id?: number | null;
  group_lead_username?: string | null;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

interface UsersResponse {
  users: UserDto[];
}

const toUser = (dto: UserDto): User => ({
  id: dto.id,
  username: dto.username,
  lastName: dto.last_name ?? null,
  firstName: dto.first_name ?? null,
  middleName: dto.middle_name ?? null,
  role: dto.role,
  groupLeadUserId: dto.group_lead_user_id ?? null,
  groupLeadUsername: dto.group_lead_username ?? null,
  mustChangePassword: dto.must_change_password ?? false,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

export const getUsers = async (): Promise<User[]> => {
  const { data } = await httpClient.get<UsersResponse>(API_ROUTES.users);
  return data.users.map(toUser);
};

export type CreateUserRole = Exclude<UserRole, "owner">;
export type EditableUserRole = UserRole;

interface CreateUserResponse {
  message: string;
  user: UserDto;
  tempPassword: string;
}

export const createUser = async (params: {
  username: string;
  role: CreateUserRole;
  groupLeadUserId: number | null;
  lastName?: string;
  firstName?: string;
  middleName?: string;
}): Promise<{ message: string; user: User; tempPassword: string }> => {
  const { data } = await httpClient.post<CreateUserResponse>(API_ROUTES.ownerUsers, params);

  return {
    message: data.message,
    user: toUser(data.user),
    tempPassword: data.tempPassword,
  };
};

interface UpdateUserResponse {
  message: string;
  user: UserDto;
}

export const updateUser = async (
  userId: number,
  params: {
    username: string;
    role: EditableUserRole;
    groupLeadUserId: number | null;
    lastName?: string | null;
    firstName?: string | null;
    middleName?: string | null;
  },
): Promise<{ message: string; user: User }> => {
  const { data } = await httpClient.patch<UpdateUserResponse>(
    API_ROUTES.ownerUserById(userId),
    params,
  );

  return {
    message: data.message,
    user: toUser(data.user),
  };
};

export const resetUserPassword = async (
  userId: number,
): Promise<{ message: string; user: { id: number; username: string }; tempPassword: string }> => {
  const { data } = await httpClient.post<{
    message: string;
    user: { id: number; username: string };
    tempPassword: string;
  }>(API_ROUTES.ownerUserResetPassword(userId));

  return data;
};

interface GroupManagerDto {
  id: number;
  username: string;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  companies_count: number;
}

export interface GroupManager {
  id: number;
  username: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  companiesCount: number;
}

interface GroupManagersResponse {
  managers: GroupManagerDto[];
}

export const getGroupLeadManagers = async (): Promise<GroupManager[]> => {
  const { data } = await httpClient.get<GroupManagersResponse>(API_ROUTES.groupLeadManagers);
  return data.managers.map((manager) => ({
    id: manager.id,
    username: manager.username,
    lastName: manager.last_name ?? null,
    firstName: manager.first_name ?? null,
    middleName: manager.middle_name ?? null,
    companiesCount: manager.companies_count,
  }));
};

interface TransferTargetsResponse {
  users: UserDto[];
}

export const getTransferTargets = async (): Promise<User[]> => {
  const { data } = await httpClient.get<TransferTargetsResponse>(API_ROUTES.usersTransferTargets);
  return data.users.map(toUser);
};
