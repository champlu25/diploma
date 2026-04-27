export interface Company {
  id: number;
  managerUserId: number;
  managerName: string;
  name: string;
  inn: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyFormValues {
  name: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  comment: string;
  nextContactAt: string;
}
