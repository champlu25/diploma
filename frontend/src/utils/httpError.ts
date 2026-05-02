import axios from "axios";

interface ErrorPayload {
  message?: unknown;
}

export const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!axios.isAxiosError(error)) {
    return fallbackMessage;
  }

  const payload = error.response?.data as ErrorPayload | undefined;
  const responseMessage = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (responseMessage) {
    return responseMessage;
  }

  return fallbackMessage;
};
