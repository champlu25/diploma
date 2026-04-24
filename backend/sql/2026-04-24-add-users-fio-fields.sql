-- Миграция: раздельные поля ФИО (фамилия/имя/отчество) для users.
-- Важно: фамилия и имя обязательны для активированного аккаунта (когда установлен пароль),
-- но могут быть NULL для приглашённых пользователей до установки пароля.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_name TEXT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name TEXT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS middle_name TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_last_name_chk') THEN
    ALTER TABLE users
    ADD CONSTRAINT users_last_name_chk CHECK (last_name IS NULL OR char_length(trim(last_name)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_first_name_chk') THEN
    ALTER TABLE users
    ADD CONSTRAINT users_first_name_chk CHECK (first_name IS NULL OR char_length(trim(first_name)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_middle_name_chk') THEN
    ALTER TABLE users
    ADD CONSTRAINT users_middle_name_chk CHECK (middle_name IS NULL OR char_length(trim(middle_name)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'full_name'
  ) THEN
    WITH parts AS (
      SELECT
        id,
        regexp_split_to_array(trim(full_name), '\\s+') AS p
      FROM users
      WHERE full_name IS NOT NULL
        AND (last_name IS NULL AND first_name IS NULL AND middle_name IS NULL)
    )
    UPDATE users AS u
    SET
      last_name = NULLIF(parts.p[1], ''),
      first_name = NULLIF(parts.p[2], ''),
      middle_name = NULLIF(
        CASE
          WHEN array_upper(parts.p, 1) >= 3 THEN array_to_string(parts.p[3:array_upper(parts.p, 1)], ' ')
          ELSE ''
        END,
        ''
      )
    FROM parts
    WHERE u.id = parts.id;
  END IF;
END $$;

ALTER TABLE users
ALTER COLUMN last_name DROP NOT NULL;

ALTER TABLE users
ALTER COLUMN first_name DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_name_required_when_active_chk'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_name_required_when_active_chk
      CHECK (password_hash IS NULL OR (last_name IS NOT NULL AND first_name IS NOT NULL));
  END IF;
END $$;

ALTER TABLE users
DROP COLUMN IF EXISTS full_name;

