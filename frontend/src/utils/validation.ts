import type { CreateUserRole } from "../api/usersApi";
import type { CompanyFormValues } from "../types/company";
import type { DealFormValues } from "../types/deal";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
export const PERSON_NAME_MAX_LENGTH = 100;
export const COMPANY_NAME_MAX_LENGTH = 255;
export const COMPANY_COMMENT_MAX_LENGTH = 2000;
export const ADDRESS_MAX_LENGTH = 500;
export const ACTIVITY_MAX_LENGTH = 200;
export const NEGATIVE_INFO_MAX_LENGTH = 2000;
export const DEAL_NEED_MAX_LENGTH = 500;
export const DEAL_COMMENT_MAX_LENGTH = 2000;
export const LEASING_COMPANY_NAME_MAX_LENGTH = 100;
export const COMMUNICATION_CHANNEL_NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const EMAIL_MAX_LENGTH = 254;
export const DIRECTOR_BIRTH_DATE_MIN = "1900-01-01";

export const usernamePattern = /^[a-z0-9._-]{3,50}$/;
export const personNamePattern = /^[A-Za-zА-Яа-яЁё -]{1,100}$/;
export const innPattern = /^\d{10}(\d{2})?$/;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = /^\+?[0-9][0-9\s\-()]{5,19}$/;
export const bikPattern = /^\d{9}$/;
export const accountNumberPattern = /^\d{20}$/;
export const nonNegativeIntegerPattern = /^\d+$/;
export const nonNegativeDecimalPattern = /^\d+([.,]\d+)?$/;
export const datetimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationErrors<T extends string> = Partial<Record<T, string>>;

export interface LoginFormValues {
  username: string;
  password: string;
}

export interface ChangePasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserProfileFormValues {
  lastName: string;
  firstName: string;
  middleName: string;
}

export interface CreateUserFormValues {
  username: string;
  role: CreateUserRole;
  groupLeadUserId: string;
  lastName: string;
  firstName: string;
  middleName: string;
}

const trim = (value: string) => value.trim();

export const sanitizeByMaxLength = (value: string, maxLength: number): string =>
  value.slice(0, maxLength);

export const sanitizeDigits = (value: string, maxLength?: number): string => {
  const sanitized = value.replace(/\D+/g, "");
  return typeof maxLength === "number" ? sanitized.slice(0, maxLength) : sanitized;
};

export const sanitizeDecimal = (
  value: string,
  options?: { maxLength?: number; allowComma?: boolean },
): string => {
  const normalized = value.replace(/[^\d.,]/g, "");
  const separator = options?.allowComma ? /[.,]/ : /\./;
  let hasSeparator = false;

  const sanitized = normalized
    .split("")
    .filter((char) => {
      if (/\d/.test(char)) {
        return true;
      }

      if (!separator.test(char) || hasSeparator) {
        return false;
      }

      hasSeparator = true;
      return true;
    })
    .join("");

  return typeof options?.maxLength === "number"
    ? sanitized.slice(0, options.maxLength)
    : sanitized;
};

export const sanitizePhone = (value: string): string =>
  value
    .split("")
    .filter((char, index) => {
      if (/\d/.test(char)) {
        return true;
      }

      if (char === "+" && index === 0) {
        return true;
      }

      return char === " " || char === "-" || char === "(" || char === ")";
    })
    .join("")
    .slice(0, 20);

export const sanitizeUsername = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);

export const sanitizePersonName = (value: string): string =>
  value.replace(/[^A-Za-zА-Яа-яЁё -]/g, "").slice(0, PERSON_NAME_MAX_LENGTH);

export const sanitizeEmail = (value: string): string =>
  value.replace(/\s+/g, "").toLowerCase().slice(0, EMAIL_MAX_LENGTH);

const isValidDateString = (value: string): boolean => {
  if (!datePattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isValidDatetimeLocalString = (value: string): boolean => {
  if (!datetimeLocalPattern.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const getTodayIsoDate = (): string => new Date().toISOString().slice(0, 10);

const validateOptionalPersonName = (value: string, label: string): string | undefined => {
  const normalized = trim(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > PERSON_NAME_MAX_LENGTH || !personNamePattern.test(normalized)) {
    return `${label} может содержать только буквы, пробелы и дефис, длина - до ${PERSON_NAME_MAX_LENGTH} символов.`;
  }

  return undefined;
};

export const validateLoginForm = (
  values: LoginFormValues,
): ValidationErrors<keyof LoginFormValues> => {
  const errors: ValidationErrors<keyof LoginFormValues> = {};
  const username = trim(values.username).toLowerCase();

  if (!username) {
    errors.username = "Введите логин.";
  } else if (!usernamePattern.test(username)) {
    errors.username = `Логин должен содержать от ${USERNAME_MIN_LENGTH} до ${USERNAME_MAX_LENGTH} символов: строчные латинские буквы, цифры, ".", "-" или "_".`;
  }

  if (!values.password) {
    errors.password = "Введите пароль.";
  }

  return errors;
};

export const validateChangePasswordForm = (
  values: ChangePasswordFormValues,
  options: { requireOldPassword: boolean },
): ValidationErrors<keyof ChangePasswordFormValues> => {
  const errors: ValidationErrors<keyof ChangePasswordFormValues> = {};

  if (options.requireOldPassword && !values.oldPassword) {
    errors.oldPassword = "Введите текущий пароль.";
  }

  if (!values.newPassword) {
    errors.newPassword = "Введите новый пароль.";
  } else if (values.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов.`;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Повторите новый пароль.";
  } else if (values.newPassword !== values.confirmPassword) {
    errors.confirmPassword = "Новый пароль и подтверждение не совпадают.";
  }

  return errors;
};

export const validateUserProfileForm = (
  values: UserProfileFormValues,
): ValidationErrors<keyof UserProfileFormValues> => ({
  lastName: validateOptionalPersonName(values.lastName, "Фамилия"),
  firstName: validateOptionalPersonName(values.firstName, "Имя"),
  middleName: validateOptionalPersonName(values.middleName, "Отчество"),
});

export const validateCreateUserForm = (
  values: CreateUserFormValues,
): ValidationErrors<keyof CreateUserFormValues> => {
  const errors: ValidationErrors<keyof CreateUserFormValues> = {
    ...validateUserProfileForm(values),
  };
  const username = trim(values.username).toLowerCase();

  if (!username) {
    errors.username = "Введите логин сотрудника.";
  } else if (!usernamePattern.test(username)) {
    errors.username = `Логин должен содержать от ${USERNAME_MIN_LENGTH} до ${USERNAME_MAX_LENGTH} символов: строчные латинские буквы, цифры, ".", "-" или "_".`;
  }

  if (values.role === "manager" && !trim(values.groupLeadUserId)) {
    errors.groupLeadUserId = "Для менеджера нужно указать руководителя группы.";
  }

  return errors;
};

export const validateLookupName = (
  value: string,
  options: { label: string; maxLength: number },
): string | undefined => {
  const normalized = trim(value);

  if (!normalized) {
    return `Введите ${options.label.toLowerCase()}.`;
  }

  if (normalized.length > options.maxLength) {
    return `${options.label} не должно превышать ${options.maxLength} символов.`;
  }

  return undefined;
};

export const validateCompanyForm = (
  values: CompanyFormValues,
): ValidationErrors<keyof CompanyFormValues> => {
  const errors: ValidationErrors<keyof CompanyFormValues> = {};
  const name = trim(values.name);
  const inn = trim(values.inn);
  const contactName = trim(values.contactName);
  const phone = trim(values.phone);
  const email = trim(values.email).toLowerCase();
  const comment = trim(values.comment);
  const nextContactAt = trim(values.nextContactAt);
  const legalAddress = trim(values.legalAddress);
  const actualAddress = trim(values.actualAddress);
  const directorBirthDate = trim(values.directorBirthDate);
  const activity = trim(values.activity);
  const revenueRub = trim(values.revenueRub);
  const negativeInfo = trim(values.negativeInfo);
  const bik = trim(values.bik);
  const rs = trim(values.rs);
  const ks = trim(values.ks);
  const preferredCommunicationChannelId = trim(values.preferredCommunicationChannelId);
  const taxSystemId = trim(values.taxSystemId);

  if (!name) {
    errors.name = "Наименование компании обязательно.";
  } else if (name.length > COMPANY_NAME_MAX_LENGTH) {
    errors.name = `Наименование компании не должно превышать ${COMPANY_NAME_MAX_LENGTH} символов.`;
  }

  if (!innPattern.test(inn)) {
    errors.inn = "ИНН должен содержать только цифры и иметь длину 10 или 12.";
  }

  if (
    contactName &&
    (contactName.length > PERSON_NAME_MAX_LENGTH || !personNamePattern.test(contactName))
  ) {
    errors.contactName =
      "Контактное лицо может содержать только буквы, пробелы и дефис, длина - до 100 символов.";
  }

  if (phone && !phonePattern.test(phone)) {
    errors.phone = "Некорректный формат телефона.";
  }

  if (email && (email.length > EMAIL_MAX_LENGTH || !emailPattern.test(email))) {
    errors.email = "Некорректный формат email.";
  }

  if (comment && comment.length > COMPANY_COMMENT_MAX_LENGTH) {
    errors.comment = `Комментарий не должен превышать ${COMPANY_COMMENT_MAX_LENGTH} символов.`;
  }

  if (nextContactAt && !isValidDatetimeLocalString(nextContactAt)) {
    errors.nextContactAt = "Некорректная дата следующего контакта.";
  }

  if (legalAddress && legalAddress.length > ADDRESS_MAX_LENGTH) {
    errors.legalAddress = `Юридический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`;
  }

  if (actualAddress && actualAddress.length > ADDRESS_MAX_LENGTH) {
    errors.actualAddress = `Фактический адрес не должен превышать ${ADDRESS_MAX_LENGTH} символов.`;
  }

  if (directorBirthDate) {
    if (!isValidDateString(directorBirthDate)) {
      errors.directorBirthDate = "Некорректная дата рождения директора.";
    } else if (
      directorBirthDate < DIRECTOR_BIRTH_DATE_MIN ||
      directorBirthDate > getTodayIsoDate()
    ) {
      errors.directorBirthDate =
        "Дата рождения директора должна быть между 1900-01-01 и сегодняшним днём.";
    }
  }

  if (activity && activity.length > ACTIVITY_MAX_LENGTH) {
    errors.activity = `Вид деятельности не должен превышать ${ACTIVITY_MAX_LENGTH} символов.`;
  }

  if (revenueRub && !nonNegativeIntegerPattern.test(revenueRub)) {
    errors.revenueRub = "Выручка должна быть целым неотрицательным числом.";
  }

  if (negativeInfo && negativeInfo.length > NEGATIVE_INFO_MAX_LENGTH) {
    errors.negativeInfo = `Поле "Выявленный негатив" не должно превышать ${NEGATIVE_INFO_MAX_LENGTH} символов.`;
  }

  if (preferredCommunicationChannelId && !nonNegativeIntegerPattern.test(preferredCommunicationChannelId)) {
    errors.preferredCommunicationChannelId = "Некорректный канал связи.";
  }

  if (taxSystemId && !nonNegativeIntegerPattern.test(taxSystemId)) {
    errors.taxSystemId = "Некорректная система налогообложения.";
  }

  const hasAnyRequisites = Boolean(bik || rs || ks);
  if (hasAnyRequisites && (!bik || !rs || !ks)) {
    const requisitesError = "Реквизиты должны быть заполнены полностью: БИК, Р/С и К/С.";
    errors.bik = requisitesError;
    errors.rs = requisitesError;
    errors.ks = requisitesError;
  } else {
    if (bik && !bikPattern.test(bik)) {
      errors.bik = "БИК должен содержать ровно 9 цифр.";
    }

    if (rs && !accountNumberPattern.test(rs)) {
      errors.rs = "Расчетный счет должен содержать ровно 20 цифр.";
    }

    if (ks && !accountNumberPattern.test(ks)) {
      errors.ks = "Корреспондентский счет должен содержать ровно 20 цифр.";
    }
  }

  return errors;
};

export const validateDealForm = (
  values: DealFormValues,
): ValidationErrors<keyof DealFormValues> => {
  const errors: ValidationErrors<keyof DealFormValues> = {};
  const need = trim(values.need);
  const comment = trim(values.comment);
  const plCostRub = trim(values.plCostRub).replace(",", ".");
  const agentFeePercent = trim(values.agentFeePercent).replace(",", ".");

  if (!need) {
    errors.need = 'Поле "Потребность" обязательно.';
  } else if (need.length > DEAL_NEED_MAX_LENGTH) {
    errors.need = `Поле "Потребность" не должно превышать ${DEAL_NEED_MAX_LENGTH} символов.`;
  }

  if (!trim(values.dealStatusId)) {
    errors.dealStatusId = "Выберите статус сделки.";
  }

  if (!trim(values.leasingCompanyId)) {
    errors.leasingCompanyId = "Выберите лизинговую компанию.";
  }

  if (!trim(values.dealStageId)) {
    errors.dealStageId = "Выберите этап сделки.";
  }

  if (!plCostRub) {
    errors.plCostRub = "Укажите стоимость ПЛ.";
  } else if (!nonNegativeDecimalPattern.test(plCostRub) || Number(plCostRub) < 0) {
    errors.plCostRub = "Стоимость ПЛ должна быть неотрицательным числом.";
  }

  if (!agentFeePercent) {
    errors.agentFeePercent = "Укажите АВ, %.";
  } else if (!nonNegativeDecimalPattern.test(agentFeePercent)) {
    errors.agentFeePercent = "АВ, % должен быть числом от 0 до 100.";
  } else {
    const percent = Number(agentFeePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      errors.agentFeePercent = "АВ, % должен быть числом от 0 до 100.";
    }
  }

  if (comment && comment.length > DEAL_COMMENT_MAX_LENGTH) {
    errors.comment = `Комментарий не должен превышать ${DEAL_COMMENT_MAX_LENGTH} символов.`;
  }

  return errors;
};

export const hasValidationErrors = <T extends string>(errors: ValidationErrors<T>): boolean =>
  Object.values(errors).some(Boolean);
