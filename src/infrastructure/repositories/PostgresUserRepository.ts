import { Database } from '../db/Database';
import { REPOSITORY_ERRORS, type IUserRepository } from '../../application/ports/IUserRepository';
import type { ILogger } from '../../application/ports/ILogger';
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserRow,
  UserSortField
} from '../../types';
import { ConflictError } from '../../domain/errors/AppError';
import { escapeLikePattern } from '../../shared/utils/sanitize';

const COLUMNS = 'id, first_name, last_name, email, age, created_at, updated_at';

/** Whitelist: nunca interpolar nombres de columna desde el usuario. */
const SORTABLE_COLUMNS: Record<UserSortField, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  age: 'age',
};

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
}

/**
 * Repositorio concreto (adapter). Traduce el dominio a SQL con consultas
 * 100% parametrizadas y mapea errores de Postgres a errores de dominio.
 */
export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly logger: ILogger) {}

  public async create(input: CreateUserInput): Promise<UserRow> {
    try {
      const { rows } = await Database.query<UserRow>(
        `INSERT INTO users (first_name, last_name, email, age)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [input.firstName, input.lastName, input.email, input.age ?? null],
        this.logger
      );
      return rows[0];
    } catch (error) {
      throw this.mapError(error);
    }
  }

  public async findById(id: string): Promise<UserRow | null> {
    const { rows } = await Database.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
      [id],
      this.logger
    );
    return rows[0] ?? null;
  }

  public async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await Database.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
      this.logger
    );
    return rows[0] ?? null;
  }

  public async findAll(query: ListUsersQuery): Promise<Paginated<UserRow>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const offset = (page - 1) * limit;
    const column = SORTABLE_COLUMNS[sortBy] ?? SORTABLE_COLUMNS.createdAt;
    const direction = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const params: unknown[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      where.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit, offset);

    const dataQuery = `SELECT ${COLUMNS} FROM users ${whereClause}
      ORDER BY ${column} ${direction} NULLS LAST, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const countQuery = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      Database.query<UserRow>(dataQuery, params, this.logger),
      Database.query<{ total: number }>(
        countQuery,
        where.length > 0 ? params.slice(0, params.length - 2) : [],
        this.logger
      ),
    ]);

    return {
      items: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil((countResult.rows[0]?.total ?? 0) / limit) : 0,
    };
  }

  public async update(id: string, input: UpdateUserInput): Promise<UserRow | null> {
    const params: unknown[] = [id];
    const assignments: string[] = [];

    // Whitelist de columnas: solo campos conocidos, nunca identificadores del usuario.
    const append = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.firstName !== undefined) append('first_name', input.firstName);
    if (input.lastName !== undefined) append('last_name', input.lastName);
    if (input.email !== undefined) append('email', input.email.toLowerCase());
    if (input.age !== undefined) append('age', input.age);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    try {
      const { rows } = await Database.query<UserRow>(
        `UPDATE users SET ${assignments.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
        params,
        this.logger
      );
      return rows[0] ?? null;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  public async delete(id: string): Promise<boolean> {
    const { rowCount } = await Database.query(`DELETE FROM users WHERE id = $1`, [id], this.logger);
    return (rowCount ?? 0) > 0;
  }

  private mapError(error: unknown): Error {
    const pgError = error as PostgresError;

    if (pgError.code === '23505' || pgError.code === REPOSITORY_ERRORS.DUPLICATE_EMAIL) {
      return new ConflictError('Email is already registered');
    }
    if (pgError.code === '23503') {
      return new ConflictError('Related resource does not exist');
    }

    return error instanceof Error ? error : new Error('Unknown repository error');
  }
}