import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/application/services/UserService';
import { AjvUserValidator } from '../../src/infrastructure/validators/AjvUserValidator';
import { NotFoundError, ValidationError, ConflictError } from '../../src/domain/errors/AppError';
import type { IUserRepository } from '../../src/application/ports/IUserRepository';
import type { ILogger } from '../../src/application/ports/ILogger';
import type { UserRow } from '../../src/types';

const buildRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ana',
  last_name: 'Lopez',
  email: 'ana@test.com',
  age: 28,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

const createRepositoryMock = () => ({
  create: vi.fn<[unknown], Promise<UserRow>>(),
  findById: vi.fn<[string], Promise<UserRow | null>>(),
  findByEmail: vi.fn<[string], Promise<UserRow | null>>(),
  findAll: vi.fn(),
  update: vi.fn<[string, unknown], Promise<UserRow | null>>(),
  delete: vi.fn<[string], Promise<boolean>>(),
});

const createLoggerMock = (): ILogger => ({
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
});

describe('UserService', () => {
  let repository: ReturnType<typeof createRepositoryMock>;
  let logger: ILogger;
  let service: UserService;
  let validator: AjvUserValidator;

  beforeEach(() => {
    repository = createRepositoryMock();
    logger = createLoggerMock();
    validator = new AjvUserValidator();
    service = new UserService(repository as unknown as IUserRepository, validator, logger);
  });

  describe('createUser', () => {
    it('crea un usuario valido', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(buildRow());

      const result = await service.createUser({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@test.com',
        age: 28,
      });

      expect(result).toMatchObject({ email: 'ana@test.com', age: 28 });
      expect(repository.create).toHaveBeenCalledWith({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@test.com',
        age: 28,
      });
    });

    it('lanza ValidationError si el payload es invalido', async () => {
      await expect(service.createUser({ email: 'no-es-email' })).rejects.toBeInstanceOf(ValidationError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('lanza ValidationError ante mass assignment', async () => {
      await expect(
        service.createUser({
          firstName: 'Ana',
          lastName: 'Lopez',
          email: 'ana@test.com',
          isAdmin: true,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('lanza ConflictError si el email ya existe', async () => {
      repository.findByEmail.mockResolvedValue(buildRow());

      await expect(
        service.createUser({ firstName: 'Ana', lastName: 'Lopez', email: 'ana@test.com' })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('getUserById', () => {
    it('retorna el usuario cuando existe', async () => {
      repository.findById.mockResolvedValue(buildRow());

      const result = await service.getUserById('11111111-1111-4111-8111-111111111111');

      expect(result.id).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('lanza NotFoundError cuando no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getUserById('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('rechaza ids no UUID antes de tocar la BD', async () => {
      await expect(service.getUserById("1' OR '1'='1")).rejects.toBeInstanceOf(ValidationError);
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('listUsers', () => {
    it('mapea filas a DTOs y calcula paginacion', async () => {
      repository.findAll.mockResolvedValue({
        items: [buildRow(), buildRow({ id: '22222222-2222-4222-8222-222222222222', email: 'carlos@test.com' })],
        total: 5,
        page: 1,
        limit: 2,
        totalPages: 3,
      });

      const result = await service.listUsers({ page: 1, limit: 2, sortBy: 'createdAt', sortOrder: 'DESC' });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
      expect(result.items[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('updateUser', () => {
    it('hace merge de campos parciales', async () => {
      repository.findById.mockResolvedValue(buildRow());
      repository.findByEmail.mockResolvedValue(buildRow());
      repository.update.mockResolvedValue(buildRow({ first_name: 'Ana Maria' }));

      const result = await service.updateUser('11111111-1111-4111-8111-111111111111', { firstName: 'Ana Maria' });

      expect(repository.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
        firstName: 'Ana Maria',
        lastName: 'Lopez',
        email: 'ana@test.com',
        age: 28,
      });
      expect(result.firstName).toBe('Ana Maria');
    });

    it('lanza ValidationError con body vacio', async () => {
      await expect(service.updateUser('11111111-1111-4111-8111-111111111111', {})).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('lanza NotFoundError si el usuario no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateUser('11111111-1111-4111-8111-111111111111', { firstName: 'Ana' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lanza ConflictError si el email pertenece a otro usuario', async () => {
      repository.findById.mockResolvedValue(buildRow());
      repository.findByEmail.mockResolvedValue(buildRow({ id: 'otro-id', email: 'otro@test.com' }));

      await expect(
        service.updateUser('11111111-1111-4111-8111-111111111111', { email: 'otro@test.com' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('permite actualizar con el mismo email propio', async () => {
      repository.findById.mockResolvedValue(buildRow());
      repository.findByEmail.mockResolvedValue(buildRow());
      repository.update.mockResolvedValue(buildRow({ age: 30 }));

      const result = await service.updateUser('11111111-1111-4111-8111-111111111111', {
        age: 30,
        email: 'ana@test.com',
      });

      expect(result.age).toBe(30);
    });
  });

  describe('deleteUser', () => {
    it('elimina cuando existe', async () => {
      repository.delete.mockResolvedValue(true);

      await expect(service.deleteUser('11111111-1111-4111-8111-111111111111')).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledTimes(1);
    });

    it('lanza NotFoundError cuando no existe', async () => {
      repository.delete.mockResolvedValue(false);

      await expect(service.deleteUser('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});