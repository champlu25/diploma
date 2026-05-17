import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";
import type { Company, CompanyDetails, CompanyFormValues } from "../types/company";

export interface GetCompaniesParams {
  searchName?: string;
  searchInn?: string;
  managerUserId?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

interface CompanyDto {
  id: number;
  manager_user_id: number;
  manager_name: string;
  name: string;
  inn: string;
  revenue_rub?: number | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  next_contact_at: string | null;
  legal_address?: string | null;
  actual_address?: string | null;
  director_birth_date?: string | null;
  activity?: string | null;
  negative_info?: string | null;
  tax_system_id?: number | null;
  tax_system_name?: string | null;
  bik?: string | null;
  rs?: string | null;
  ks?: string | null;
  preferred_communication_channel_id?: number | null;
  preferred_communication_channel_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface ListCompaniesResponse {
  companies: CompanyDto[];
  hasMore?: boolean;
}

export interface CompaniesPageResponse {
  companies: Company[];
  hasMore: boolean;
}

interface CompanyDtoResponse {
  message: string;
  company: CompanyDto;
}

interface CompanyDetailsResponse {
  company: CompanyDto;
}

export interface CompanyLookupItem {
  id: number;
  name: string;
}

export interface CommunicationChannelLookupItem extends CompanyLookupItem {
  isActive?: boolean;
}

interface CompanyLookupsResponse {
  taxSystems: CompanyLookupItem[];
  communicationChannels: CommunicationChannelLookupItem[];
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
  managerUserId: dto.manager_user_id,
  managerName: dto.manager_name,
  name: dto.name,
  inn: dto.inn,
  revenueRub: typeof dto.revenue_rub === "number" ? dto.revenue_rub : (dto.revenue_rub ?? null),
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
  legalAddress: values.legalAddress,
  actualAddress: values.actualAddress,
  directorBirthDate: values.directorBirthDate,
  activity: values.activity,
  revenueRub: values.revenueRub,
  negativeInfo: values.negativeInfo,
  bik: values.bik,
  rs: values.rs,
  ks: values.ks,
  taxSystemId: values.taxSystemId,
  preferredCommunicationChannelId: values.preferredCommunicationChannelId,
});

const toCompanyDetails = (dto: CompanyDto): CompanyDetails => ({
  ...toCompany(dto),
  legalAddress: dto.legal_address ?? null,
  actualAddress: dto.actual_address ?? null,
  directorBirthDate: dto.director_birth_date ?? null,
  activity: dto.activity ?? null,
  revenueRub: typeof dto.revenue_rub === "number" ? dto.revenue_rub : (dto.revenue_rub ?? null),
  negativeInfo: dto.negative_info ?? null,
  bik: dto.bik ?? null,
  rs: dto.rs ?? null,
  ks: dto.ks ?? null,
  taxSystemId: dto.tax_system_id ?? null,
  taxSystemName: dto.tax_system_name ?? null,
  preferredCommunicationChannelId: dto.preferred_communication_channel_id ?? null,
  preferredCommunicationChannelName: dto.preferred_communication_channel_name ?? null,
});

export const getCompaniesPage = async (
  params?: GetCompaniesParams,
): Promise<CompaniesPageResponse> => {
  const { data } = await httpClient.get<ListCompaniesResponse>(API_ROUTES.companies, {
    params,
  });
  return {
    companies: data.companies.map(toCompany),
    hasMore: data.hasMore ?? false,
  };
};

export const getCompanies = async (params?: GetCompaniesParams): Promise<Company[]> => {
  const data = await getCompaniesPage(params);
  return data.companies;
};

export const getCompanyById = async (companyId: number): Promise<CompanyDetails> => {
  const { data } = await httpClient.get<CompanyDetailsResponse>(API_ROUTES.companyById(companyId));
  return toCompanyDetails(data.company);
};

export const getCompanyLookups = async (): Promise<CompanyLookupsResponse> => {
  const { data } = await httpClient.get<CompanyLookupsResponse>(API_ROUTES.companyLookups);
  return data;
};

export const createCompany = async (values: CompanyFormValues): Promise<CompanyResponse> => {
  const { data } = await httpClient.post<CompanyDtoResponse>(
    API_ROUTES.companies,
    toPayload(values),
  );
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
    API_ROUTES.companyById(companyId),
    toPayload(values),
  );
  return {
    ...data,
    company: toCompany(data.company),
  };
};

export const deleteCompany = async (companyId: number): Promise<DeleteCompanyResponse> => {
  const { data } = await httpClient.delete<DeleteCompanyResponse>(
    API_ROUTES.companyById(companyId),
  );
  return data;
};

export const transferCompany = async (
  companyId: number,
  targetUserId: number,
): Promise<CompanyResponse> => {
  const { data } = await httpClient.post<CompanyDtoResponse>(
    API_ROUTES.companyTransfer(companyId),
    { targetUserId },
  );

  return {
    ...data,
    company: toCompany(data.company),
  };
};
