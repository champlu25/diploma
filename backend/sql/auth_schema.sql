CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE roles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (char_length(trim(email)) > 3),
  last_name TEXT NULL CHECK (last_name IS NULL OR char_length(trim(last_name)) > 0),
  first_name TEXT NULL CHECK (first_name IS NULL OR char_length(trim(first_name)) > 0),
  middle_name TEXT NULL CHECK (middle_name IS NULL OR char_length(trim(middle_name)) > 0),
  password_hash TEXT NULL CHECK (password_hash IS NULL OR char_length(trim(password_hash)) > 0),
  role_id BIGINT NOT NULL REFERENCES roles(id),
  group_lead_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_name_required_when_active_chk
    CHECK (password_hash IS NULL OR (last_name IS NOT NULL AND first_name IS NOT NULL))
);

CREATE TABLE password_setup_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(trim(token_hash)) > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  inn TEXT NOT NULL UNIQUE CHECK (inn ~ '^[0-9]{10}([0-9]{2})?$'),
  contact_name TEXT NULL CHECK (contact_name IS NULL OR char_length(trim(contact_name)) > 0),
  phone TEXT NULL CHECK (phone IS NULL OR char_length(trim(phone)) > 0),
  email TEXT NULL CHECK (email IS NULL OR char_length(trim(email)) > 0),
  comment TEXT NULL CHECK (comment IS NULL OR char_length(trim(comment)) > 0),
  next_contact_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deal_statuses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE leasing_companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deal_stages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  need TEXT NOT NULL CHECK (char_length(trim(need)) > 0),
  deal_status_id BIGINT NOT NULL REFERENCES deal_statuses(id) ON DELETE RESTRICT,
  pl_cost_rub BIGINT NOT NULL CHECK (pl_cost_rub >= 0),
  leasing_company_id BIGINT NOT NULL REFERENCES leasing_companies(id) ON DELETE RESTRICT,
  advance_percent NUMERIC(5, 2) NOT NULL CHECK (advance_percent >= 0 AND advance_percent <= 100),
  advance_total_rub BIGINT NOT NULL CHECK (advance_total_rub >= 0),
  deal_stage_id BIGINT NOT NULL REFERENCES deal_stages(id) ON DELETE RESTRICT,
  comment TEXT NULL CHECK (comment IS NULL OR char_length(trim(comment)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_group_lead_user_id ON users(group_lead_user_id);
CREATE INDEX idx_password_setup_tokens_user_id ON password_setup_tokens(user_id);
CREATE INDEX idx_password_setup_tokens_expires_at ON password_setup_tokens(expires_at);
CREATE INDEX idx_companies_owner_user_id ON companies(owner_user_id);
CREATE INDEX idx_companies_created_at ON companies(created_at);
CREATE INDEX idx_deals_company_id ON deals(company_id);
CREATE INDEX idx_deals_created_at ON deals(created_at);
CREATE INDEX idx_deals_deal_status_id ON deals(deal_status_id);
CREATE INDEX idx_deals_deal_stage_id ON deals(deal_stage_id);
CREATE INDEX idx_deals_leasing_company_id ON deals(leasing_company_id);

CREATE TRIGGER trg_roles_set_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_password_setup_tokens_set_updated_at
BEFORE UPDATE ON password_setup_tokens
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deal_statuses_set_updated_at
BEFORE UPDATE ON deal_statuses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leasing_companies_set_updated_at
BEFORE UPDATE ON leasing_companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deal_stages_set_updated_at
BEFORE UPDATE ON deal_stages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deals_set_updated_at
BEFORE UPDATE ON deals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (name) VALUES
('owner'),
('manager'),
('group_lead')
ON CONFLICT (name) DO NOTHING;

INSERT INTO deal_statuses (name) VALUES
('Горячая'),
('Холодная')
ON CONFLICT (name) DO NOTHING;

INSERT INTO leasing_companies (name) VALUES
('ВТБЛизинг'),
('СберЛизинг')
ON CONFLICT (name) DO NOTHING;

INSERT INTO deal_stages (name) VALUES
('Переговоры'),
('Продажа'),
('Поиск ТС'),
('Расчёты'),
('Сбор документов'),
('На одобрении'),
('Авансовый платёж'),
('Выдача'),
('Ожидание АВ'),
('АВ Получено')
ON CONFLICT (name) DO NOTHING;
