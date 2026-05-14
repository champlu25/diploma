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
  name TEXT NOT NULL UNIQUE CHECK (
    name = trim(name) 
    AND name ~ '^[a-zA-Z0-9_]+$'
    AND char_length(name) BETWEEN 1 AND 50
  )
);

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (
    username ~ '^[a-z0-9._-]{3,50}$'
  ),
  last_name TEXT NULL CHECK (
    last_name IS NULL OR (
      last_name = trim(last_name)
      AND
      last_name ~ '^[A-Za-zА-Яа-яЁё -]{1,100}$'
    )
  ),
  first_name TEXT NULL CHECK (
    first_name IS NULL OR (
      first_name = trim(first_name)
      AND
      first_name ~ '^[A-Za-zА-Яа-яЁё -]{1,100}$'
    )
  ),
  middle_name TEXT NULL CHECK (
    middle_name IS NULL OR (
      middle_name = trim(middle_name)
      AND
      middle_name ~ '^[A-Za-zА-Яа-яЁё -]{1,100}$'
    )
  ),
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  group_lead_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  CHECK (group_lead_user_id IS NULL OR group_lead_user_id <> id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tax_systems (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE communication_channels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 255),
  inn TEXT NOT NULL UNIQUE CHECK (inn ~ '^[0-9]{10}([0-9]{2})?$'),
  contact_name TEXT NULL CHECK (
    contact_name IS NULL OR (
      contact_name = trim(contact_name)
      AND
      contact_name ~ '^[A-Za-zА-Яа-яЁё -]{1,100}$'
    )
  ),
  phone TEXT NULL CHECK (
    phone IS NULL OR (
      phone ~ '^\+?[0-9][0-9\s\-\(\)]{5,19}$'
    )
  ),
  email TEXT NULL CHECK (
    email IS NULL OR (
      email = lower(trim(email))
      AND char_length(email) <= 254
      AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    )
  ),
  comment TEXT NULL CHECK (comment IS NULL OR (comment = trim(comment) AND char_length(comment) BETWEEN 1 AND 2000)),
  next_contact_at TIMESTAMPTZ NULL,
  legal_address TEXT NULL CHECK (legal_address IS NULL OR (legal_address = trim(legal_address) AND char_length(legal_address) BETWEEN 1 AND 500)),
  actual_address TEXT NULL CHECK (actual_address IS NULL OR (actual_address = trim(actual_address) AND char_length(actual_address) BETWEEN 1 AND 500)),
  director_birth_date DATE NULL CHECK (
    director_birth_date IS NULL
    OR (director_birth_date >= DATE '1900-01-01' AND director_birth_date <= CURRENT_DATE)
  ),
  activity TEXT NULL CHECK (activity IS NULL OR (activity = trim(activity) AND char_length(activity) BETWEEN 1 AND 200)),
  revenue_rub BIGINT NULL CHECK (revenue_rub IS NULL OR revenue_rub >= 0),
  negative_info TEXT NULL CHECK (negative_info IS NULL OR (negative_info = trim(negative_info) AND char_length(negative_info) BETWEEN 1 AND 2000)),
  bik TEXT NULL CHECK (bik IS NULL OR bik ~ '^\d{9}$'),
  rs TEXT NULL CHECK (rs IS NULL OR rs ~ '^\d{20}$'),
  ks TEXT NULL CHECK (ks IS NULL OR ks ~ '^\d{20}$'),
  tax_system_id BIGINT NULL REFERENCES tax_systems(id) ON DELETE RESTRICT,
  preferred_communication_channel_id BIGINT NULL REFERENCES communication_channels(id) ON DELETE RESTRICT,
  CHECK (
    (bik IS NULL AND rs IS NULL AND ks IS NULL)
    OR (bik IS NOT NULL AND rs IS NOT NULL AND ks IS NOT NULL)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deal_statuses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE deal_lifecycle_statuses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE leasing_companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deal_stages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE deals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  need TEXT NOT NULL CHECK (need = trim(need) AND char_length(need) BETWEEN 1 AND 500),
  deal_status_id BIGINT NOT NULL REFERENCES deal_statuses(id) ON DELETE RESTRICT,
  deal_lifecycle_status_id BIGINT NOT NULL REFERENCES deal_lifecycle_statuses(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NULL,
  pl_cost_rub NUMERIC(15, 2) NOT NULL CHECK (pl_cost_rub >= 0),
  leasing_company_id BIGINT NOT NULL REFERENCES leasing_companies(id) ON DELETE RESTRICT,
  agent_fee_percent NUMERIC(5, 2) NOT NULL CHECK (agent_fee_percent >= 0 AND agent_fee_percent <= 100),
  deal_stage_id BIGINT NOT NULL REFERENCES deal_stages(id) ON DELETE RESTRICT,
  comment TEXT NULL CHECK (comment IS NULL OR (comment = trim(comment) AND char_length(comment) BETWEEN 1 AND 2000)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chart_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name = trim(name) AND char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE user_chart_view_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chart_key TEXT NOT NULL CHECK (
    chart_key ~ '^[a-z0-9_]+$'
    AND char_length(chart_key) BETWEEN 1 AND 50
  ),
  chart_type_id BIGINT NOT NULL REFERENCES chart_types(id) ON DELETE RESTRICT,
  UNIQUE (user_id, chart_key)
);

CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_group_lead_user_id ON users(group_lead_user_id);
CREATE INDEX idx_companies_manager_user_id ON companies(manager_user_id);
CREATE INDEX idx_companies_tax_system_id ON companies(tax_system_id);
CREATE INDEX idx_companies_preferred_communication_channel_id ON companies(preferred_communication_channel_id);
CREATE INDEX idx_deals_company_id ON deals(company_id);
CREATE INDEX idx_deals_deal_status_id ON deals(deal_status_id);
CREATE INDEX idx_deals_deal_lifecycle_status_id ON deals(deal_lifecycle_status_id);
CREATE INDEX idx_deals_leasing_company_id ON deals(leasing_company_id);
CREATE INDEX idx_user_chart_view_settings_user_id ON user_chart_view_settings(user_id);
CREATE INDEX idx_user_chart_view_settings_chart_type_id ON user_chart_view_settings(chart_type_id);

CREATE UNIQUE INDEX uq_roles_name_ci ON roles (lower(name));
CREATE UNIQUE INDEX uq_tax_systems_name_ci ON tax_systems (lower(name));
CREATE UNIQUE INDEX uq_communication_channels_name_ci ON communication_channels (lower(name));
CREATE UNIQUE INDEX uq_deal_statuses_name_ci ON deal_statuses (lower(name));
CREATE UNIQUE INDEX uq_deal_lifecycle_statuses_name_ci ON deal_lifecycle_statuses (lower(name));
CREATE UNIQUE INDEX uq_leasing_companies_name_ci ON leasing_companies (lower(name));
CREATE UNIQUE INDEX uq_deal_stages_name_ci ON deal_stages (lower(name));
CREATE UNIQUE INDEX uq_chart_types_name_ci ON chart_types (lower(name));

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leasing_companies_set_updated_at
BEFORE UPDATE ON leasing_companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_communication_channels_set_updated_at
BEFORE UPDATE ON communication_channels
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
ON CONFLICT DO NOTHING;

INSERT INTO tax_systems (name) VALUES
('ОСН'),
('УСН 6%'),
('УСН 15%')
ON CONFLICT DO NOTHING;

INSERT INTO communication_channels (name) VALUES
('Телефон'),
('Почта'),
('Мессенджер')
ON CONFLICT DO NOTHING;

INSERT INTO deal_statuses (name) VALUES
('Горячая'),
('Холодная')
ON CONFLICT DO NOTHING;

INSERT INTO deal_lifecycle_statuses (name) VALUES
('Активные'),
('Реализованные'),
('Отложенные'),
('Несостоявшиеся')
ON CONFLICT DO NOTHING;

INSERT INTO leasing_companies (name) VALUES
('ВТБЛизинг'),
('СберЛизинг'),
('Газпромбанк Лизинг'),
('Альфа-Лизинг'),
('Европлан'),
('Балтийский лизинг'),
('Интерлизинг')
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

INSERT INTO chart_types (name) VALUES
('Горизонтальный'),
('Вертикальный'),
('Круговой')
ON CONFLICT DO NOTHING;
