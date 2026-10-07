import dotenv from 'dotenv';

dotenv.config();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const isLocal = process.env.IS_LOCAL === 'true' || process.env.NODE_ENV === 'local';

export const dbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: toInt(process.env.DB_PORT, 5432),
  user: process.env.DB_USER ?? 'app_user',
  password: process.env.DB_PASSWORD ?? 'app_password',
  database: process.env.DB_NAME ?? 'users_db',
  max: toInt(process.env.DB_MAX_POOL, 10),
  idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: toInt(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  ssl: toBool(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : undefined,
  applicationName: process.env.DB_APP_NAME ?? 'sam-users-crud',
  secretArn: process.env.DB_SECRET_ARN ?? '',
  isLocal,
} as const;

export const loggerConfig = {
  level: process.env.LOG_LEVEL ?? (isLocal ? 'debug' : 'info'),
  // Pretty requiere el worker de pino: se activa solo si se pide explicitamente (LOG_PRETTY=true).
  pretty: toBool(process.env.LOG_PRETTY, false),
  service: process.env.SERVICE_NAME ?? 'users-crud',
} as const;

export const allowedOrigin = process.env.ALLOWED_ORIGIN ?? '*';