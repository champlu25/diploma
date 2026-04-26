import { httpClient } from "./httpClient";
import type { Company, CompanyFormValues } from "../types/company";

interface CompanyDto {
  id: number;
  owner_user_id: number;
  owner_email: string;
  name: string;
  inn: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  next_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ListCompaniesResponse {
  companies: CompanyDto[];
}

interface CompanyDtoResponse {
  message: string;
  company: CompanyDto;
}

interface DeleteCompanyResponse {
  message: string;
}

interface CompanyResponse {
  message: string;
  company: Company;
}

const toCompany = (dto: CompanyDto): Company => ({
  id: dto.id,
  ownerUserId: dto.owner_user_id,
  ownerEmail: dto.owner_email,
  name: dto.name,
  inn: dto.inn,
  contactName: dto.contact_name,
  phone: dto.phone,
  email: dto.email,
  comment: dto.comment,
  nextContactAt: dto.next_contact_at,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

const toPayload = (values: CompanyFormValues) => ({
  name: values.name,
  inn: values.inn,
  contactName: values.contactName,
  phone: values.phone,
  email: values.email,
  comment: values.comment,
  nextContactAt: values.nextContactAt,
});

export const getCompanies = async (): Promise<Company[]> => {
  const { data } = await httpClient.get<ListCompaniesResponse>("/api/companies");
  return data.companies.map(toCompany);
};

export const createCompany = async (values: CompanyFormValues): Promise<CompanyResponse> => {
  const { data } = await httpClient.post<CompanyDtoResponse>("/api/companies", toPayload(values));
  return {
    ...data,
    company: toCompany(data.company),
  };
};

export const updateCompany = async (
  companyId: number,
  values: CompanyFormValues,
): Promise<CompanyResponse> => {
  const { data } = await httpClient.patch<CompanyDtoResponse>(
    `/api/companies/${companyId}`,
    toPayload(values),
  );
  return {
    ...data,
    company: toCompany(data.company),
  };
};

export const deleteCompany = async (companyId: number): Promise<DeleteCompanyResponse> => {
  const { data } = await httpClient.delete<DeleteCompanyResponse>(`/api/companies/${companyId}`);
  return data;
};

export const transferCompany = async (
  companyId: number,
  targetUserId: number,
): Promise<CompanyResponse> => {
  const { data } = await httpClient.post<CompanyDtoResponse>(
    `/api/companies/${companyId}/transfer`,
    { targetUserId },
  );

  return {
    ...data,
    company: toCompany(data.company),
  };
};
