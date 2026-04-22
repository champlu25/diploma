export type UserRole = "owner" | "manager" | "group_lead";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}

export interface User extends AuthUser {
  groupLeadUserId?: number | null;
  groupLeadEmail?: string | null;
}
