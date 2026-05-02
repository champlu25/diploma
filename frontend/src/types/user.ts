export type UserRole = "owner" | "manager" | "group_lead";

export interface CurrentUser {
  id: number;
  username: string;
  lastName: string | null;
  firstName: string | null;
  middleName?: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  groupLeadUserId?: number | null;
  groupLeadUsername?: string | null;
}

export interface User extends CurrentUser {
  createdAt: string;
  updatedAt: string;
}
