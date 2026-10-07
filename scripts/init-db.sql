CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  age        INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

INSERT INTO users (first_name, last_name, email, age)
VALUES
  ('Ana', 'Lopez', 'ana.lopez@test.com', 28),
  ('Carlos', 'Ruiz', 'carlos.ruiz@test.com', 34)
ON CONFLICT (email) DO NOTHING;