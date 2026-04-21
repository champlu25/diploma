import type { UserRole } from "../types/user";

const roleLabels: Record<UserRole, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  group_lead: "Руководитель группы",
};

export const getRoleLabel = (role: string): string => {
  return roleLabels[role as UserRole] ?? role;
};
