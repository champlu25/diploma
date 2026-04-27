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
    groupLead: { username: "lead", password: "Password123" },
    manager1: { username: "manager1", password: "Password123" },
    manager2: { username: "manager2", password: "Password123" },
  };

  const owner = await insertUser(client, {
    ...credentials.owner,
    roleId: ownerRoleId,
    lastName: "Владелец",
    firstName: "Системы",
  });

  const groupLead = await insertUser(client, {
    ...credentials.groupLead,
    roleId: groupLeadRoleId,
    lastName: "Руководитель",
    firstName: "Группы",
  });

  const manager1 = await insertUser(client, {
    ...credentials.manager1,
    roleId: managerRoleId,
    lastName: "Менеджер",
    firstName: "Первый",
    groupLeadUserId: groupLead.id,
  });

  const manager2 = await insertUser(client, {
    ...credentials.manager2,
    roleId: managerRoleId,
    lastName: "Менеджер",
    firstName: "Второй",
    groupLeadUserId: groupLead.id,
  });

  const hotStatusId = await selectLookupIdByName(client, "deal_statuses", "Горячая");
  const coldStatusId = await selectLookupIdByName(
    client,
    "deal_statuses",
    "Холодная",
  );
  const activeLifecycleId = await selectLookupIdByName(
    client,
    "deal_lifecycle_statuses",
    "Активные",
  );
  const realizedLifecycleId = await selectLookupIdByName(
    client,
    "deal_lifecycle_statuses",
    "Реализованные",
  );
  const vtbLeasingId = await selectLookupIdByName(
    client,
    "leasing_companies",
    "ВТБЛизинг",
  );
  const sberLeasingId = await selectLookupIdByName(
    client,
    "leasing_companies",
    "СберЛизинг",
  );
  const negotiationStageId = await selectLookupIdByName(
    client,
    "deal_stages",
    "Переговоры",
  );
  const saleStageId = await selectLookupIdByName(client, "deal_stages", "Продажа");

  const companies = [
    {
      managerUserId: manager1.id,
      name: 'ООО "Ромашка"',
      inn: "7701234567",
      contactName: "Иван Иванов",
      phone: "+79990000001",
      email: "contact@romashka.example",
      comment: "Тестовая компания",
    },
    {
      managerUserId: manager2.id,
      name: 'ООО "Вектор"',
      inn: "7812345678",
      contactName: "Пётр Петров",
      phone: "+79990000002",
      email: "info@vector.example",
      comment: "Вторая тестовая компания",
    },
  ];

  const createdCompanies = [];
  for (const company of companies) {
    const result = await client.query(
      `
        INSERT INTO companies (
          manager_user_id,
          name,
          inn,
          contact_name,
          phone,
          email,
          comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      ],
    );
    createdCompanies.push(result.rows[0]);
  }

  const [companyA, companyB] = createdCompanies;

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
        advance_percent,
        advance_total_rub,
        deal_stage_id,
        comment
      )
      VALUES
        ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10),
        ($11, $12, $13, $14, NOW(), $15, $16, $17, $18, $19, $20)
    `,
    [
      companyA.id,
      "Нужен лизинг на легковой автомобиль",
      hotStatusId,
      activeLifecycleId,
      2_500_000,
      vtbLeasingId,
      20,
      500_000,
      negotiationStageId,
      "Первая тестовая сделка",
      companyB.id,
      "Лизинг на грузовой автомобиль",
      coldStatusId,
      realizedLifecycleId,
      6_800_000,
      sberLeasingId,
      10,
      680_000,
      saleStageId,
      "Вторая тестовая сделка (реализована)",
    ],
  );

  return { credentials, users: { owner, groupLead, manager1, manager2 } };
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
    console.log(
      `- group_lead: ${seedResult.credentials.groupLead.username} / ${seedResult.credentials.groupLead.password}`,
    );
    console.log(
      `- manager1: ${seedResult.credentials.manager1.username} / ${seedResult.credentials.manager1.password}`,
    );
    console.log(
      `- manager2: ${seedResult.credentials.manager2.username} / ${seedResult.credentials.manager2.password}`,
    );
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
