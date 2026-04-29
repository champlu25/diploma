import { httpClient } from "./httpClient";
import type { DealLookupItem } from "../types/deal";

interface GetLeasingCompaniesResponse {
  leasingCompanies: DealLookupItem[];
}

interface CreateLeasingCompanyResponse {
  leasingCompany: DealLookupItem;
}

export const getOwnerLeasingCompanies = async (): Promise<DealLookupItem[]> => {
  const { data } = await httpClient.get<GetLeasingCompaniesResponse>("/api/owner/leasing-companies");
  return data.leasingCompanies;
};

export const createOwnerLeasingCompany = async (name: string): Promise<DealLookupItem> => {
  const { data } = await httpClient.post<CreateLeasingCompanyResponse>("/api/owner/leasing-companies", { name });
  return data.leasingCompany;
};

