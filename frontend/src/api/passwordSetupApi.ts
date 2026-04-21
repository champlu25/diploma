import { httpClient } from "./httpClient";

export interface PasswordSetupSession {
  email: string;
  role: string;
  expiresAt: string;
}

interface PasswordSetupSessionResponse {
  session: PasswordSetupSession;
}

interface CompletePasswordSetupResponse {
  message: string;
}

export const getPasswordSetupSession = async (
  token: string,
): Promise<PasswordSetupSession> => {
  const { data } = await httpClient.get<PasswordSetupSessionResponse>(
    "/api/password-setup/session",
    {
      params: { token },
    },
  );

  return data.session;
};

export const completePasswordSetup = async (
  token: string,
  password: string,
): Promise<CompletePasswordSetupResponse> => {
  const { data } = await httpClient.post<CompletePasswordSetupResponse>(
    "/api/password-setup/complete",
    { token, password },
  );

  return data;
};
