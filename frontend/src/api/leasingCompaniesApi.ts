import { httpClient } from "./httpClient";
import { API_ROUTES } from "../constants/api";

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
    API_ROUTES.ownerLeasingCompanies,
  );
  return data.leasingCompanies;
};

export const createOwnerLeasingCompany = async (name: string): Promise<LeasingCompany> => {
  const { data } = await httpClient.post<CreateLeasingCompanyResponse>(
    API_ROUTES.ownerLeasingCompanies,
    { name },
  );
  return data.leasingCompany;
};

export const updateOwnerLeasingCompany = async (
  id: number,
  name: string,
): Promise<LeasingCompany> => {
  const { data } = await httpClient.patch<UpdateLeasingCompanyResponse>(
    API_ROUTES.ownerLeasingCompanyById(id),
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
    API_ROUTES.ownerLeasingCompanyById(id),
    {
      isActive,
    },
  );
  return data.leasingCompany;
};

export const deleteOwnerLeasingCompany = async (id: number): Promise<void> => {
  await httpClient.delete(API_ROUTES.ownerLeasingCompanyById(id));
};
