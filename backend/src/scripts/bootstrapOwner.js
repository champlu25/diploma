const dotenv = require('dotenv');
dotenv.config();

const { pool } = require('../db');
const { hashPassword, validatePassword } = require('../security');

const username = process.argv[2] ? String(process.argv[2]).trim().toLowerCase() : '';
const password = process.argv[3] ? String(process.argv[3]) : '';
const lastName = process.argv[4] ? String(process.argv[4]).trim() : '';
const firstName = process.argv[5] ? String(process.argv[5]).trim() : '';
const middleName = process.argv[6] ? String(process.argv[6]).trim() : '';

const run = async () => {
  if (!username) {
    console.error(
      'Использование: npm run bootstrap:owner -- <username> <password> <lastName> <firstName> [middleName]',
    );
    process.exit(1);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(passwordError);
    process.exit(1);
  }

  if (!lastName || !firstName) {
    console.error('Фамилия и имя обязательны.');
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
      throw new Error('Роль "owner" не найдена. Сначала выполните schema.sql.');
    }

    const roleId = roleResult.rows[0].id;

	    const result = await client.query(
	      `
	        INSERT INTO users (username, last_name, first_name, middle_name, password_hash, role_id, must_change_password)
	        VALUES ($1, $2, $3, $4, $5, $6, FALSE)
	        ON CONFLICT (username) DO UPDATE
	        SET
	          last_name = EXCLUDED.last_name,
	          first_name = EXCLUDED.first_name,
	          middle_name = EXCLUDED.middle_name,
	          password_hash = EXCLUDED.password_hash,
	          role_id = EXCLUDED.role_id,
	          must_change_password = FALSE,
	          updated_at = NOW()
	        RETURNING id, username
	      `,
	      [username, lastName, firstName, middleName || null, passwordHash, roleId],
	    );

    await client.query('COMMIT');

    const user = result.rows[0];
	    console.log(`Владелец готов: id=${user.id}, username=${user.username}`);
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
