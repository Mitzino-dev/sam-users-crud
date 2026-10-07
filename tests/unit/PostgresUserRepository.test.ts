import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PostgresUserRepository } from '../../src/infrastructure/repositories/PostgresUserRepository';
import { Database } from '../../src/infrastructure/db/Database';
import { ConflictError } from '../../src/domain/errors/AppError';
import type { ILogger } from '../../src/application/ports/ILogger';
import type { UserRow } from '../../src/types';

const loggerMock: ILogger = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
};

const row: UserRow = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ana',
  last_name: 'Lopez',
  email: 'ana@test.com',
  age: 28,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
};

describe('PostgresUserRepository', () => {
  let repository: PostgresUserRepository;
  let querySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repository = new PostgresUserRepository(loggerMock);
    querySpy = vi.spyOn(Database, 'query');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('usa consultas parametrizadas (sin interpolacion de valores)', async () => {
      querySpy.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

      const result = await repository.create({
        firstName: "Robert'); DROP TABLE users;--",
        lastName: 'Tables',
        email: 'evil@test.com',
        age: 40,
      });

      const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('$1, $2, $3, $4');
      expect(sql).not.toContain('DROP TABLE');
      expect(params).toEqual(["Robert'); DROP TABLE users;--", 'Tables', 'evil@test.com', 40]);
      expect(result.id).toBe(row.id);
    });

    it('mapea error 23505 a ConflictError', async () => {
      querySpy.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

      await expect(
        repository.create({ firstName: 'Ana', lastName: 'Lopez', email: 'ana@test.com' })
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('findById', () => {
    it('retorna la fila o null', async () => {
      querySpy.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never);
      expect((await repository.findById(row.id))?.email).toBe('ana@test.com');

      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
      expect(await repository.findById(row.id)).toBeNull();
    });

    it('parametriza el id', async () => {
      querySpy.mockResolvedValue({ rows: [], rowCount: 0 } as never);
      await repository.findById('abc');
      expect(querySpy.mock.calls[0][1]).toEqual(['abc']);
    });
  });

  describe('findByEmail', () => {
    it('normaliza a minusculas', async () => {
      querySpy.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

      await repository.findByEmail('ANA@Test.com');

      expect(querySpy.mock.calls[0][1]).toEqual(['ana@test.com']);
    });
  });

  describe('findAll', () => {
    it('aplica paginacion y orden sin interpolar valores', async () => {
      querySpy.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never).mockResolvedValueOnce({
        rows: [{ total: 1 }],
        rowCount: 1,
      } as never);

      const result = await repository.findAll({ page: 2, limit: 10, sortBy: 'firstName', sortOrder: 'ASC' });

      const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ORDER BY first_name ASC');
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([10, 10]);
      expect(result).toMatchObject({ total: 1, page: 2, limit: 10, totalPages: 1 });
    });

    it('escapa wildcards del termino de busqueda', async () => {
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never).mockResolvedValueOnce({
        rows: [{ total: 0 }],
        rowCount: 1,
      } as never);

      await repository.findAll({ page: 1, limit: 10, search: '100%_x', sortBy: 'createdAt', sortOrder: 'DESC' });

      const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ILIKE $1');
      expect(params[0]).toBe('%100\\%\\_x%');
      expect(querySpy.mock.calls[1][1]).toEqual(['%100\\%\\_x%']);
    });

    it('cae a created_at si el campo de orden no existe en la whitelist', async () => {
      querySpy.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never).mockResolvedValueOnce({
        rows: [{ total: 0 }],
        rowCount: 1,
      } as never);

      await repository.findAll({
        page: 1,
        limit: 10,
        sortBy: 'id; DROP TABLE users' as never,
        sortOrder: 'DESC',
      });

      expect((querySpy.mock.calls[0][0] as string)).toContain('ORDER BY created_at DESC');
      expect((querySpy.mock.calls[0][0] as string)).not.toContain('DROP');
    });
  });

  describe('update', () => {
    it('solo incluye columnas presentes en el payload', async () => {
      querySpy.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

      await repository.update(row.id, { firstName: 'Ana Maria' });

      const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('SET first_name = $2');
      expect(sql).not.toContain('last_name =');
      expect(params).toEqual([row.id, 'Ana Maria']);
    });

    it('permite poner age en null de forma explicita', async () => {
      querySpy.mockResolvedValue({ rows: [{ ...row, age: null }], rowCount: 1 } as never);

      const result = await repository.update(row.id, { age: null });

      expect((querySpy.mock.calls[0][0] as string)).toContain('age = $2');
      expect(result.age).toBeNull();
    });

    it('no ejecuta UPDATE si no hay cambios', async () => {
      querySpy.mockResolvedValue({ rows: [row], rowCount: 1 } as never);

      const result = await repository.update(row.id, {});

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][0]).toContain('SELECT');
      expect(result.id).toBe(row.id);
    });
  });

  describe('delete', () => {
    it('retorna true si se elimino una fila', async () => {
      querySpy.mockResolvedValue({ rows: [], rowCount: 1 } as never);
      expect(await repository.delete(row.id)).toBe(true);
    });

    it('retorna false si no habia fila', async () => {
      querySpy.mockResolvedValue({ rows: [], rowCount: 0 } as never);
      expect(await repository.delete(row.id)).toBe(false);
    });
  });
});