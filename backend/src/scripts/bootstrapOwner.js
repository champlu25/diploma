const dotenv = require('dotenv');
dotenv.config();

const { pool } = require('../db');
const { hashPassword, validatePassword } = require('../security');

const email = process.argv[2] ? String(process.argv[2]).trim().toLowerCase() : '';
const password = process.argv[3] ? String(process.argv[3]) : '';

const run = async () => {
  if (!email) {
    console.error('Использование: npm run bootstrap:owner -- <email> <password>');
    process.exit(1);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(passwordError);
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roleResult = await client.query(
      `
        SELECT id
        FROM roles
        WHERE name = 'owner'
        LIMIT 1
      `,
    );

    if (roleResult.rowCount === 0) {
      throw new Error('Роль "owner" не найдена. Сначала выполните auth_schema.sql.');
    }

    const roleId = roleResult.rows[0].id;

    const result = await client.query(
      `
        INSERT INTO users (email, password_hash, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE
        SET
          password_hash = EXCLUDED.password_hash,
          role_id = EXCLUDED.role_id,
          updated_at = NOW()
        RETURNING id, email
      `,
      [email, passwordHash, roleId],
    );

    await client.query('COMMIT');

    const user = result.rows[0];
    console.log(`Владелец готов: id=${user.id}, email=${user.email}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Не удалось создать/обновить владельца:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch(async (error) => {
  console.error('Ошибка выполнения скрипта:', error.message);
  await pool.end();
  process.exit(1);
});
