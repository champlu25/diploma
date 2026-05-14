const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Leasing CRM API",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local backend",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Users" },
    { name: "Companies" },
    { name: "Deals" },
    { name: "Dashboards" },
    { name: "Owner" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "access_token",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", example: "owner" },
          password: { type: "string", example: "password123" },
        },
      },
      ProfileRequest: {
        type: "object",
        properties: {
          lastName: { type: "string", nullable: true },
          firstName: { type: "string", nullable: true },
          middleName: { type: "string", nullable: true },
        },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["newPassword"],
        properties: {
          oldPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
      },
      CompanyRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          inn: { type: "string" },
          contactName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          comment: { type: "string", nullable: true },
          nextContactAt: { type: "string", format: "date-time", nullable: true },
          legalAddress: { type: "string", nullable: true },
          actualAddress: { type: "string", nullable: true },
          directorBirthDate: { type: "string", format: "date", nullable: true },
          activity: { type: "string", nullable: true },
          revenueRub: { type: "integer", minimum: 0, nullable: true },
          negativeInfo: { type: "string", nullable: true },
          bik: { type: "string", nullable: true },
          rs: { type: "string", nullable: true },
          ks: { type: "string", nullable: true },
          taxSystemId: { type: "integer", nullable: true },
          preferredCommunicationChannelId: { type: "integer", nullable: true },
        },
      },
      DealRequest: {
        type: "object",
        properties: {
          need: { type: "string" },
          dealStatusId: { type: "integer" },
          leasingCompanyId: { type: "integer" },
          dealStageId: { type: "integer" },
          plCostRub: { type: "number", minimum: 0 },
          agentFeePercent: { type: "number", minimum: 0, maximum: 100 },
          comment: { type: "string", nullable: true },
        },
      },
      LifecycleStatusRequest: {
        type: "object",
        required: ["dealLifecycleStatusId"],
        properties: {
          dealLifecycleStatusId: { type: "integer" },
        },
      },
      OwnerUserRequest: {
        type: "object",
        required: ["username", "role"],
        properties: {
          username: { type: "string" },
          role: { type: "string", enum: ["manager", "group_lead"] },
          lastName: { type: "string", nullable: true },
          firstName: { type: "string", nullable: true },
          middleName: { type: "string", nullable: true },
          groupLeadUserId: { type: "integer", nullable: true },
        },
      },
      DictionaryItemRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Проверить доступность сервиса",
        responses: {
          200: { description: "Сервис работает" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Получить текущего пользователя",
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: "Текущий пользователь" },
          401: { description: "Нет авторизации" },
        },
      },
      patch: {
        tags: ["Auth"],
        summary: "Обновить профиль текущего пользователя",
        security: [{ cookieAuth: [] }],
        requestBody: jsonBody("ProfileRequest"),
        responses: {
          200: { description: "Профиль обновлен" },
          401: { description: "Нет авторизации" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Войти в систему",
        requestBody: jsonBody("LoginRequest"),
        responses: {
          200: { description: "Вход выполнен" },
          400: { description: "Некорректный запрос" },
          401: { description: "Неверный логин или пароль" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Выйти из системы",
        responses: {
          200: { description: "Выход выполнен" },
        },
      },
    },
    "/api/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Изменить пароль",
        security: [{ cookieAuth: [] }],
        requestBody: jsonBody("ChangePasswordRequest"),
        responses: {
          200: { description: "Пароль изменен" },
          400: { description: "Некорректный запрос" },
          401: { description: "Нет авторизации" },
        },
      },
    },
    "/api/users": getProtected("Users", "Получить список пользователей", true),
    "/api/users/transfer-targets": getProtected(
      "Users",
      "Получить пользователей для передачи компании",
    ),
    "/api/group-lead/managers": getProtected(
      "Users",
      "Получить менеджеров текущего руководителя группы",
    ),
    "/api/companies": {
      get: protectedOperation("Companies", "Получить список компаний"),
      post: {
        ...protectedOperation("Companies", "Создать компанию"),
        requestBody: jsonBody("CompanyRequest"),
      },
    },
    "/api/companies/lookups": getProtected(
      "Companies",
      "Получить справочники компаний",
    ),
    "/api/companies/{companyId}": {
      parameters: [pathId("companyId")],
      get: protectedOperation("Companies", "Получить компанию"),
      patch: {
        ...protectedOperation("Companies", "Обновить компанию"),
        requestBody: jsonBody("CompanyRequest"),
      },
      delete: protectedOperation("Companies", "Удалить компанию"),
    },
    "/api/companies/{companyId}/transfer": {
      parameters: [pathId("companyId")],
      post: {
        ...protectedOperation("Companies", "Передать компанию другому пользователю"),
        requestBody: inlineJsonBody({
          type: "object",
          required: ["targetUserId"],
          properties: {
            targetUserId: { type: "integer" },
          },
        }),
      },
    },
    "/api/deals/lookups": getProtected("Deals", "Получить справочники сделок"),
    "/api/deals": getProtected("Deals", "Получить список сделок"),
    "/api/companies/{companyId}/deals": {
      parameters: [pathId("companyId")],
      post: {
        ...protectedOperation("Deals", "Создать сделку для компании"),
        requestBody: jsonBody("DealRequest"),
      },
    },
    "/api/deals/{dealId}": {
      parameters: [pathId("dealId")],
      patch: {
        ...protectedOperation("Deals", "Обновить сделку"),
        requestBody: jsonBody("DealRequest"),
      },
      delete: protectedOperation("Deals", "Удалить сделку"),
    },
    "/api/deals/{dealId}/lifecycle-status": {
      parameters: [pathId("dealId")],
      patch: {
        ...protectedOperation("Deals", "Изменить жизненный статус сделки"),
        requestBody: jsonBody("LifecycleStatusRequest"),
      },
    },
    "/api/dashboards/chart-view-settings": getProtected(
      "Dashboards",
      "Получить настройки отображения графиков",
    ),
    "/api/dashboards/chart-view-settings/{chartKey}": {
      parameters: [
        {
          name: "chartKey",
          in: "path",
          required: true,
          schema: {
            type: "string",
            pattern: "^[a-z0-9_]+$",
            maxLength: 50,
          },
        },
      ],
      put: {
        ...protectedOperation("Dashboards", "Сохранить настройку отображения графика"),
        requestBody: inlineJsonBody({
          type: "object",
          required: ["chartTypeId"],
          properties: {
            chartTypeId: { type: "integer" },
          },
        }),
      },
    },
    "/api/owner/users/{userId}/group-lead": {
      parameters: [pathId("userId")],
      patch: {
        ...protectedOperation("Owner", "Назначить руководителя группы менеджеру"),
        requestBody: inlineJsonBody({
          type: "object",
          required: ["groupLeadUserId"],
          properties: {
            groupLeadUserId: { type: "integer" },
          },
        }),
      },
    },
    "/api/owner/users": {
      post: {
        ...protectedOperation("Owner", "Создать пользователя"),
        requestBody: jsonBody("OwnerUserRequest"),
      },
    },
    "/api/owner/users/{userId}/reset-password": {
      parameters: [pathId("userId")],
      post: protectedOperation("Owner", "Сбросить пароль пользователя"),
    },
    "/api/owner/leasing-companies": ownerDictionaryPath(
      "лизинговую компанию",
    ),
    "/api/owner/leasing-companies/{leasingCompanyId}": {
      parameters: [pathId("leasingCompanyId")],
      patch: {
        ...protectedOperation("Owner", "Обновить лизинговую компанию"),
        requestBody: jsonBody("DictionaryItemRequest"),
      },
      delete: protectedOperation("Owner", "Удалить лизинговую компанию"),
    },
    "/api/owner/communication-channels": ownerDictionaryPath("канал связи"),
    "/api/owner/communication-channels/{channelId}": {
      parameters: [pathId("channelId")],
      patch: {
        ...protectedOperation("Owner", "Обновить канал связи"),
        requestBody: jsonBody("DictionaryItemRequest"),
      },
      delete: protectedOperation("Owner", "Удалить канал связи"),
    },
  },
};

function protectedOperation(tag, summary) {
  return {
    tags: [tag],
    summary,
    security: [{ cookieAuth: [] }],
    responses: {
      200: { description: "Успешный ответ" },
      400: { description: "Некорректный запрос" },
      401: { description: "Нет авторизации" },
      403: { description: "Недостаточно прав" },
      404: { description: "Не найдено" },
    },
  };
}

function getProtected(tag, summary) {
  return {
    get: protectedOperation(tag, summary),
  };
}

function jsonBody(schemaName) {
  return inlineJsonBody({
    $ref: `#/components/schemas/${schemaName}`,
  });
}

function inlineJsonBody(schema) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function pathId(name) {
  return {
    name,
    in: "path",
    required: true,
    schema: {
      type: "integer",
    },
  };
}

function ownerDictionaryPath(title) {
  return {
    get: protectedOperation("Owner", `Получить ${title}`),
    post: {
      ...protectedOperation("Owner", `Создать ${title}`),
      requestBody: jsonBody("DictionaryItemRequest"),
    },
  };
}

module.exports = openApiSpec;
