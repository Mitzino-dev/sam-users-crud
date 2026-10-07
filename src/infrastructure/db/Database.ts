import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { dbConfig } from '../../config';
import type { ILogger } from '../../application/ports/ILogger';
import { InternalServerError } from '../../domain/errors/AppError';

interface DbCredentials {
  username?: string;
  password?: string;
}

/**
 * Fachada de acceso a Postgres.
 * - Pool reutilizado entre invocaciones (evita conexiones por cold start).
 * - Consultas siempre parametrizadas ($1, $2...) ->immune a SQL injection.
 * - Credenciales desde Secrets Manager en produccion, cacheadas en modulo.
 */
export class Database {
  private static pool: Pool | undefined;
  private static credentials: DbCredentials | undefined;
  private static initializing: Promise<void> | undefined;

  private static async ensureInitialized(logger?: ILogger): Promise<void> {
    if (Database.pool) return;
    Database.initializing ??= Database.createPool(logger);
    await Database.initializing;
  }

  private static async createPool(logger?: ILogger): Promise<void> {
    if (!dbConfig.secretArn) {
      Database.pool = Database.buildPool();
      return;
    }

    try {
      const {
        SecretsManagerClient,
        GetSecretValueCommand
      } = await import('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({});
      const result = await client.send(new GetSecretValueCommand({ SecretId: dbConfig.secretArn }));
      const secret = JSON.parse(result.SecretString ?? '{}') as DbCredentials;

      Database.credentials = { username: secret.username, password: secret.password };
      Database.pool = Database.buildPool();
      logger?.info('Database credentials resolved from Secrets Manager');
    } catch (error) {
      throw new InternalServerError(`Unable to resolve DB credentials: ${(error as Error).message}`);
    }
  }

  private static buildPool(): Pool {
    const pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: Database.credentials?.username ?? dbConfig.user,
      password: Database.credentials?.password ?? dbConfig.password,
      database: dbConfig.database,
      max: dbConfig.max,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      ssl: dbConfig.ssl,
      application_name: dbConfig.applicationName,
    });

    pool.on('error', (error) => {
      console.error('Unexpected error on idle Postgres client', error.message);
    });

    return pool;
  }

  private static getPool(): Pool {
    if (!Database.pool) {
      throw new InternalServerError('Database pool is not initialized');
    }
    return Database.pool;
  }

  static async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
    logger?: ILogger
  ): Promise<QueryResult<T>> {
    await Database.ensureInitialized(logger);
    const startedAt = Date.now();

    try {
      const result = await Database.getPool().query<T>(text, params);
      logger?.debug('DB query executed', { durationMs: Date.now() - startedAt, rows: result.rowCount });
      return result;
    } catch (error) {
      logger?.error('DB query failed', { error: (error as Error).message, durationMs: Date.now() - startedAt });
      throw error;
    }
  }

  /** Unit of Work: transaccion con cliente dedicado y rollback ante error. */
  static async transaction<T>(work: (client: PoolClient) => Promise<T>, logger?: ILogger): Promise<T> {
    await Database.ensureInitialized(logger);
    const client = await Database.getPool().connect();
    const startedAt = Date.now();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      logger?.debug('Transaction committed', { durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger?.error('Transaction rolled back', { error: (error as Error).message, durationMs: Date.now() - startedAt });
      throw error instanceof Error ? error : new InternalServerError('Transaction failed');
    } finally {
      client.release();
    }
  }

  static async healthCheck(logger?: ILogger): Promise<boolean> {
    try {
      await Database.query('SELECT 1', [], logger);
      return true;
    } catch (error) {
      logger?.error('DB health check failed', { error: (error as Error).message });
      return false;
    }
  }

  static async close(): Promise<void> {
    if (Database.pool) {
      await Database.pool.end();
      Database.pool = undefined;
      Database.credentials = undefined;
      Database.initializing = undefined;
    }
  }
}