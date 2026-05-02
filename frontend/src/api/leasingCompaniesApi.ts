import { httpClient } from "./httpClient";

export interface LeasingCompany {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GetLeasingCompaniesResponse {
  leasingCompanies: LeasingCompany[];
}

interface CreateLeasingCompanyResponse {
  leasingCompany: LeasingCompany;
}

interface UpdateLeasingCompanyResponse {
  leasingCompany: LeasingCompany;
}

export const getOwnerLeasingCompanies = async (): Promise<LeasingCompany[]> => {
  const { data } = await httpClient.get<GetLeasingCompaniesResponse>(
    "/api/owner/leasing-companies",
  );
  return data.leasingCompanies;
};

export const createOwnerLeasingCompany = async (name: string): Promise<LeasingCompany> => {
  const { data } = await httpClient.post<CreateLeasingCompanyResponse>(
    "/api/owner/leasing-companies",
    { name },
  );
  return data.leasingCompany;
};

export const updateOwnerLeasingCompany = async (
  id: number,
  name: string,
): Promise<LeasingCompany> => {
  const { data } = await httpClient.patch<UpdateLeasingCompanyResponse>(
    `/api/owner/leasing-companies/${id}`,
    {
      name,
    },
  );
  return data.leasingCompany;
};

export const setOwnerLeasingCompanyActive = async (
  id: number,
  isActive: boolean,
): Promise<LeasingCompany> => {
  const { data } = await httpClient.patch<UpdateLeasingCompanyResponse>(
    `/api/owner/leasing-companies/${id}`,
    {
      isActive,
    },
  );
  return data.leasingCompany;
};

export const deleteOwnerLeasingCompany = async (id: number): Promise<void> => {
  await httpClient.delete(`/api/owner/leasing-companies/${id}`);
};
