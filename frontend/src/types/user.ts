export type UserRole = "owner" | "manager" | "group_lead";

export interface AuthUser {
  id: number;
  email: string;
  lastName: string | null;
  firstName: string | null;
  middleName?: string | null;
  role: UserRole;
}

export interface User extends AuthUser {
  groupLeadUserId?: number | null;
  groupLeadEmail?: string | null;
}
