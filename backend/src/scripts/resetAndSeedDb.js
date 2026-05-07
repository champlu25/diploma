const fs = require("fs");
const path = require("path");

const dotenv = require("dotenv");
dotenv.config();

const { Client } = require("pg");
const { hashPassword } = require("../security");

const argv = process.argv.slice(2);
const shouldReset =
  argv.includes("--yes") || argv.includes("--force") || argv.includes("-y");

const requiredEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Переменная окружения ${key} обязательна.`);
  }
  return value;
};

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getDbConfig = () => ({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "leasing_crm",
});

const getAdminConfig = (dbConfig) => ({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: process.env.DB_ADMIN_DB || "postgres",
});

const runSqlFile = async (client, filePath) => {
  const sqlBuffer = fs.readFileSync(filePath);
  let sql = sqlBuffer.toString("utf8");

  if (sql.charCodeAt(0) === 0xfeff) {
    sql = sql.slice(1);
  }

  try {
    await client.query({ text: sql, queryMode: "simple" });
  } catch (error) {
    const positionRaw = error?.position;
    const position = Number(positionRaw);

    if (Number.isFinite(position) && position > 0) {
      const index = position - 1;
      const before = sql.slice(0, index);
      const line = before.split("\n").length;
      const col = index - before.lastIndexOf("\n");
      const lineText = sql.split("\n")[line - 1] ?? "";

      console.error(`Ошибка SQL в файле: ${filePath}:${line}:${col}`);
      console.error(lineText);
    } else {
      console.error(`Ошибка SQL в файле: ${filePath}`);
    }

    if (error?.message) console.error(`Сообщение: ${error.message}`);
    if (error?.code) console.error(`Код: ${error.code}`);
    if (error?.where) console.error(`Where: ${error.where}`);
    if (error?.detail) console.error(`Detail: ${error.detail}`);
    if (error?.hint) console.error(`Hint: ${error.hint}`);

    throw error;
  }
};

const selectLookupIdByName = async (client, tableName, name) => {
  const result = await client.query(
    `SELECT id FROM ${quoteIdentifier(tableName)} WHERE name = $1 LIMIT 1`,
    [name],
  );

  if (result.rowCount === 0) {
    throw new Error(`Не найдено значение "${name}" в таблице ${tableName}.`);
  }

  return result.rows[0].id;
};

const insertUser = async (
  client,
  {
    username,
    password,
    roleId,
    lastName,
    firstName,
    middleName,
    groupLeadUserId,
    mustChangePassword = false,
  },
) => {
  const passwordHash = hashPassword(password);

  const result = await client.query(
    `
      INSERT INTO users (
        username,
        last_name,
        first_name,
        middle_name,
        password_hash,
        must_change_password,
        role_id,
        group_lead_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username
    `,
    [
      username,
      lastName,
      firstName,
      middleName ?? null,
      passwordHash,
      mustChangePassword,
      roleId,
      groupLeadUserId ?? null,
    ],
  );

  return result.rows[0];
};

const seedDefaultChartViewSettings = async (client, users) => {
  const horizontalChartTypeId = await selectLookupIdByName(client, "chart_types", "Горизонтальный");
  const verticalChartTypeId = await selectLookupIdByName(client, "chart_types", "Вертикальный");
  const pieChartTypeId = await selectLookupIdByName(client, "chart_types", "Круговой");

  const defaultSettings = [
    { chartKey: "manager_deals_count", chartTypeId: pieChartTypeId },
    { chartKey: "manager_income_rub", chartTypeId: horizontalChartTypeId },
    { chartKey: "leasing_av_rub", chartTypeId: verticalChartTypeId },
    { chartKey: "stage_av_rub", chartTypeId: pieChartTypeId },
  ];

  for (const user of users) {
    for (const setting of defaultSettings) {
      await client.query(
        `
          INSERT INTO user_chart_view_settings (user_id, chart_key, chart_type_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, chart_key)
          DO UPDATE SET
            chart_type_id = EXCLUDED.chart_type_id
        `,
        [user.id, setting.chartKey, setting.chartTypeId],
      );
    }
  }
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rng, items) => items[Math.floor(rng() * items.length)];

const randomInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

const randomDaysAgoSql = (days) => `NOW() - INTERVAL '${days} days'`;

const seedTestData = async (client) => {
  const rolesResult = await client.query(`SELECT id, name FROM roles`);
  const roleIds = new Map(rolesResult.rows.map((row) => [row.name, row.id]));

  const ownerRoleId = roleIds.get("owner");
  const groupLeadRoleId = roleIds.get("group_lead");
  const managerRoleId = roleIds.get("manager");

  if (!ownerRoleId || !groupLeadRoleId || !managerRoleId) {
    throw new Error(
      'Не найдены роли owner/manager/group_lead. Сначала выполните schema.sql.',
    );
  }

  const credentials = {
    owner: { username: "owner", password: "Password123" },
    groupLeads: [
      { username: "lead1", password: "Password123" },
      { username: "lead2", password: "Password123" },
    ],
    managers: Array.from({ length: 7 }, (_item, index) => ({
      username: `manager${index + 1}`,
      password: "Password123",
    })),
  };

  const owner = await insertUser(client, {
    ...credentials.owner,
    roleId: ownerRoleId,
    lastName: "Иванов",
    firstName: "Иван",
    middleName: "Иванович",
  });

  const groupLead1 = await insertUser(client, {
    ...credentials.groupLeads[0],
    roleId: groupLeadRoleId,
    lastName: "Петров",
    firstName: "Пётр",
    middleName: "Петрович",
  });

  const groupLead2 = await insertUser(client, {
    ...credentials.groupLeads[1],
    roleId: groupLeadRoleId,
    lastName: "Морозова",
    firstName: "Елена",
    middleName: "Андреевна",
  });

  const managerProfiles = [
    ["Сидоров", "Сергей", "Сергеевич"],
    ["Кузнецова", "Анна", "Викторовна"],
    ["Смирнов", "Алексей", "Олегович"],
    ["Васильева", "Мария", "Игоревна"],
    ["Попов", "Дмитрий", "Александрович"],
    ["Новикова", "Ольга", "Павловна"],
    ["Фёдоров", "Никита", "Романович"],
  ];

  const groupLeads = [groupLead1, groupLead2];
  const managers = [];
  for (let i = 0; i < credentials.managers.length; i += 1) {
    const [lastName, firstName, middleName] = managerProfiles[i];
    const groupLeadUserId = i < 3 ? groupLead1.id : groupLead2.id;

    managers.push(
      await insertUser(client, {
        ...credentials.managers[i],
        roleId: managerRoleId,
        lastName,
        firstName,
        middleName,
        groupLeadUserId,
      }),
    );
  }

  await seedDefaultChartViewSettings(client, [owner, ...groupLeads, ...managers]);

  const dealStatusesResult = await client.query(`SELECT id, name FROM deal_statuses ORDER BY id ASC`);
  const dealLifecyclesResult = await client.query(`SELECT id, name FROM deal_lifecycle_statuses ORDER BY id ASC`);
  const leasingCompaniesResult = await client.query(
    `SELECT id, name FROM leasing_companies WHERE is_active = TRUE ORDER BY id ASC`,
  );
  const dealStagesResult = await client.query(`SELECT id, name FROM deal_stages ORDER BY id ASC`);
  const taxSystemsResult = await client.query(`SELECT id, name FROM tax_systems ORDER BY id ASC`);
  const communicationChannelsResult = await client.query(
    `SELECT id, name FROM communication_channels WHERE is_active = TRUE ORDER BY id ASC`,
  );

  const statusByName = new Map(dealStatusesResult.rows.map((row) => [row.name, row.id]));
  const lifecycleByName = new Map(dealLifecyclesResult.rows.map((row) => [row.name, row.id]));

  const hotStatusId = statusByName.get("Горячая");
  const coldStatusId = statusByName.get("Холодная");
  const activeLifecycleId = lifecycleByName.get("Активные");
  const realizedLifecycleId = lifecycleByName.get("Реализованные");
  const delayedLifecycleId = lifecycleByName.get("Отложенные");
  const failedLifecycleId = lifecycleByName.get("Несостоявшиеся");

  if (!hotStatusId || !coldStatusId) {
    throw new Error('Не найдены статусы "Горячая"/"Холодная" в deal_statuses.');
  }
  if (!activeLifecycleId || !realizedLifecycleId || !delayedLifecycleId || !failedLifecycleId) {
    throw new Error('Не найдены статусы жизненного цикла в deal_lifecycle_statuses.');
  }
  if (leasingCompaniesResult.rowCount === 0) {
    throw new Error("Не найдены активные лизинговые компании в leasing_companies.");
  }
  if (dealStagesResult.rowCount === 0) {
    throw new Error("Не найдены этапы сделки в deal_stages.");
  }
  if (taxSystemsResult.rowCount === 0) {
    throw new Error("Не найдены системы налогообложения в tax_systems.");
  }
  if (communicationChannelsResult.rowCount === 0) {
    throw new Error("Не найдены каналы связи в communication_channels.");
  }

  const leasingCompanyIds = leasingCompaniesResult.rows.map((row) => row.id);
  const stageIds = dealStagesResult.rows.map((row) => row.id);
  const taxSystemIds = taxSystemsResult.rows.map((row) => row.id);
  const communicationChannelIds = communicationChannelsResult.rows.map((row) => row.id);

  // Seed more data so dashboards have something to plot.
  const rng = mulberry32(20260430);

  const companies = [];
  const companyNamePool = [
    'ООО "Ромашка"',
    'ООО "Вектор"',
    'ООО "Сфера"',
    'ООО "Альфа"',
    'ООО "Бета"',
    'ООО "Гамма"',
    'ООО "Омега"',
    'ООО "Логистик"',
    'ООО "ТрансСервис"',
    'ООО "СтройМаш"',
    'ООО "Север"',
    'ООО "Юг"',
    'ООО "ВолгаТех"',
    'ООО "Меркурий"',
    'ООО "Орион"',
    'ООО "Пульс"',
    'ООО "Гранит"',
    'ООО "Феникс"',
  ];
  const contactFirstNames = ["Иван", "Пётр", "Сергей", "Алексей", "Андрей", "Виктор", "Николай", "Дмитрий"];
  const contactLastNames = ["Иванов", "Петров", "Сидоров", "Кузнецов", "Смирнов", "Васильев", "Попов", "Новиков"];
  const cityPool = ["Москва", "Санкт-Петербург", "Нижний Новгород", "Саратов", "Казань"];
  const streetPool = ["Транспортная", "Складская", "Лесная", "Промышленная", "Центральная"];
  const activityPool = [
    "Грузовые перевозки и логистические услуги",
    "Строительные работы",
    "Оптовая торговля",
    "Аренда спецтехники",
    "Производство",
  ];
  const negativePool = [
    null,
    "Не указано",
    "Была просрочка по платежам (уточняется)",
    "Имеются замечания по документам",
  ];

  const randomDateOnly = (fromYear, toYear) => {
    const year = randomInt(rng, fromYear, toYear);
    const month = randomInt(rng, 1, 12);
    const day = randomInt(rng, 1, 28);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const companyCount = 24;
  for (let i = 0; i < companyCount; i += 1) {
    const managerUserId = managers[i % managers.length].id;
    const baseName = companyNamePool[i % companyNamePool.length];
    const suffix = i < companyNamePool.length ? "" : ` ${i + 1}`;
    const name = `${baseName}${suffix}`;

    // 10-digit INN, unique, matches schema regex.
    const inn = String(7700000000 + i).padStart(10, "0");

    const firstName = pick(rng, contactFirstNames);
    const lastName = pick(rng, contactLastNames);
    const cityLegal = pick(rng, cityPool);
    const streetLegal = pick(rng, streetPool);
    const buildingLegal = randomInt(rng, 1, 45);
    const cityActual = pick(rng, cityPool);
    const streetActual = pick(rng, streetPool);
    const buildingActual = randomInt(rng, 1, 45);

    companies.push({
      managerUserId,
      name,
      inn,
      contactName: `${firstName} ${lastName}`,
      phone: `+7999000${String(1000 + i).slice(-4)}`,
      email: `c${inn}@example.test`,
      comment: i % 3 === 0 ? "Тестовые данные" : null,
      legalAddress: `г. ${cityLegal}, ул. ${streetLegal}, ${buildingLegal}`,
      actualAddress: `г. ${cityActual}, ул. ${streetActual}, ${buildingActual}`,
      directorBirthDate: rng() < 0.8 ? randomDateOnly(1965, 1995) : null,
      activity: rng() < 0.9 ? pick(rng, activityPool) : null,
      revenueRub: rng() < 0.8 ? randomInt(rng, 5_000_000, 900_000_000) : null,
      negativeInfo: pick(rng, negativePool),
      bik: "044525225",
      rs: `4070281040001000${String(9000 + i).padStart(4, "0")}`,
      ks: "30101810400000000225",
      taxSystemId: pick(rng, taxSystemIds),
      preferredCommunicationChannelId: rng() < 0.85 ? pick(rng, communicationChannelIds) : null,
    });
  }

  const createdCompanies = [];
  for (const company of companies) {
    const nextContactAtDays = randomInt(rng, 0, 21);
    const nextContactAtSql = rng() < 0.7 ? randomDaysAgoSql(-nextContactAtDays) : null;

    const result = await client.query(
      `
        INSERT INTO companies (
          manager_user_id,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment,
          next_contact_at,
          legal_address,
          actual_address,
          director_birth_date,
          activity,
          revenue_rub,
          negative_info,
          bik,
          rs,
          ks,
          tax_system_id,
          preferred_communication_channel_id,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          ${nextContactAtSql ? nextContactAtSql : "NULL"},
          $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          NOW(), NOW()
        )
        RETURNING id, name, inn, manager_user_id
      `,
      [
        company.managerUserId,
        company.name,
        company.inn,
        company.contactName,
        company.phone,
        company.email,
        company.comment,
        company.legalAddress,
        company.actualAddress,
        company.directorBirthDate,
        company.activity,
        company.revenueRub,
        company.negativeInfo,
        company.bik,
        company.rs,
        company.ks,
        company.taxSystemId,
        company.preferredCommunicationChannelId,
      ],
    );
    createdCompanies.push(result.rows[0]);
  }

  const needsPool = [
    "Лизинг на легковой автомобиль",
    "Лизинг на грузовой автомобиль",
    "Лизинг на спецтехнику",
    "Обновление автопарка",
    "Лизинг на коммерческий транспорт",
  ];
  const commentPool = [
    "Первичный контакт",
    "Ждём КП",
    "Согласование условий",
    "Запрос документов",
    "Сделка в работе",
    "Пауза по инициативе клиента",
  ];

  // More deals for charts: a good spread across lifecycle/status/stages/leasing.
  const dealCount = 140;
  for (let i = 0; i < dealCount; i += 1) {
    const company = pick(rng, createdCompanies);

    const lifecycleRoll = rng();
    const lifecycleId =
      lifecycleRoll < 0.5
        ? activeLifecycleId
        : lifecycleRoll < 0.7
          ? realizedLifecycleId
          : lifecycleRoll < 0.85
            ? delayedLifecycleId
            : failedLifecycleId;

    const dealStatusId = rng() < 0.6 ? hotStatusId : coldStatusId;
    const leasingCompanyId = pick(rng, leasingCompanyIds);
    const stageId = pick(rng, stageIds);

    const plCostRub = randomInt(rng, 500_000, 15_000_000);
    const agentFeePercent = randomInt(rng, 5, 25);

    const createdDaysAgo = randomInt(rng, 0, 180);
    const updatedDaysAgo = Math.max(0, createdDaysAgo - randomInt(rng, 0, 14));

    const completedAtSql =
      lifecycleId === activeLifecycleId ? "NULL" : randomDaysAgoSql(randomInt(rng, 0, 120));

    await client.query(
      `
        INSERT INTO deals (
          company_id,
          need,
          deal_status_id,
          deal_lifecycle_status_id,
          completed_at,
          pl_cost_rub,
          leasing_company_id,
          agent_fee_percent,
          deal_stage_id,
          comment,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          ${completedAtSql},
          $5,
          $6,
          $7,
          $8,
          $9,
          ${randomDaysAgoSql(createdDaysAgo)},
          ${randomDaysAgoSql(updatedDaysAgo)}
        )
      `,
      [
        company.id,
        pick(rng, needsPool),
        dealStatusId,
        lifecycleId,
        plCostRub,
        leasingCompanyId,
        agentFeePercent,
        stageId,
        rng() < 0.75 ? pick(rng, commentPool) : null,
      ],
    );
  }

  return { credentials, users: { owner, groupLeads, managers } };
};

const main = async () => {
  if (!shouldReset) {
    console.error(
      "ОСТОРОЖНО: этот скрипт удаляет БД целиком.\n" +
        "Запуск: node src/scripts/resetAndSeedDb.js --yes",
    );
    process.exit(1);
  }

  const dbConfig = getDbConfig();
  const adminConfig = getAdminConfig(dbConfig);
  const dbName = dbConfig.database;

  if (!dbName || String(dbName).trim().toLowerCase() === "postgres") {
    throw new Error('DB_NAME не должен быть пустым или равен "postgres".');
  }

  const adminClient = new Client(adminConfig);
  await adminClient.connect();

  try {
    try {
      const versionResult = await adminClient.query("SHOW server_version_num");
      const versionNum = Number(versionResult.rows?.[0]?.server_version_num);
      if (Number.isFinite(versionNum) && versionNum > 0 && versionNum < 100000) {
        console.warn(
          `Предупреждение: версия PostgreSQL (${versionNum}) может быть слишком старой для schema.sql (IDENTITY/ON CONFLICT).`,
        );
      }
    } catch {
      // ignore
    }

    await adminClient.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [dbName],
    );

    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
  } finally {
    await adminClient.end();
  }

  const dbClient = new Client(dbConfig);
  await dbClient.connect();

  try {
    const schemaPath = path.resolve(__dirname, "../../sql/schema.sql");
    await runSqlFile(dbClient, schemaPath);

    await dbClient.query("BEGIN");
    const seedResult = await seedTestData(dbClient);
    await dbClient.query("COMMIT");

    console.log("БД пересоздана и заполнена тестовыми данными.");
    console.log("Тестовые пользователи (username / password):");
    console.log(
      `- owner: ${seedResult.credentials.owner.username} / ${seedResult.credentials.owner.password}`,
    );
    seedResult.credentials.groupLeads.forEach((credentials, index) => {
      console.log(`- group_lead${index + 1}: ${credentials.username} / ${credentials.password}`);
    });
    seedResult.credentials.managers.forEach((credentials, index) => {
      console.log(`- manager${index + 1}: ${credentials.username} / ${credentials.password}`);
    });
  } catch (error) {
    try {
      await dbClient.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await dbClient.end();
  }
};

main().catch((error) => {
  console.error("Не удалось пересоздать/засидить БД:", error?.message || error);
  process.exit(1);
});
