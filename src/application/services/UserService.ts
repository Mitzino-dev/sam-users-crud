import type { IUserRepository } from '../ports/IUserRepository';
import type { ILogger } from '../ports/ILogger';
import type { IUserValidator } from '../ports/IUserValidator';
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserDto
} from '../../types';
import { User } from '../../domain/entities/User';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/AppError';

export interface IUserService {
  createUser(input: unknown): Promise<UserDto>;
  getUserById(id: string): Promise<UserDto>;
  listUsers(query: ListUsersQuery): Promise<Paginated<UserDto>>;
  updateUser(id: string, input: unknown): Promise<UserDto>;
  deleteUser(id: string): Promise<void>;
}

/**
 * Caso de uso / Servicio de aplicacion. Orquesta el flujo:
 * validar -> construir entidad de dominio -> persistir -> mapear a DTO.
 * No conoce detalles de infraestructura (repositorio, logger, AJV concretos).
 */
export class UserService implements IUserService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly validator: IUserValidator,
    private readonly logger: ILogger
  ) {}

  public async createUser(input: unknown): Promise<UserDto> {
    const validation = this.validator.validateCreateUser(input);
    if (!validation.isValid || !validation.value) {
      throw new ValidationError('Invalid user payload', validation.issues);
    }

    const dto = validation.value as unknown as CreateUserInput;
    const entity = User.create(dto);

    await this.assertEmailAvailable(entity.email);

    this.logger.info('Creating user', { email: entity.email });

    const created = await this.userRepository.create({
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      age: entity.age,
    });

    this.logger.info('User created', { id: created.id });

    return User.fromRow(created).toDto();
  }

  public async getUserById(id: string): Promise<UserDto> {
    const validId = this.validator.validateId(id);
    const row = await this.userRepository.findById(validId);

    if (!row) {
      throw new NotFoundError('User');
    }

    return User.fromRow(row).toDto();
  }

  public async listUsers(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const result = await this.userRepository.findAll(query);

    return {
      items: result.items.map((row) => User.fromRow(row).toDto()),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
    };
  }

  public async updateUser(id: string, input: unknown): Promise<UserDto> {
    const validId = this.validator.validateId(id);

    const validation = this.validator.validateUpdateUser(input);
    if (!validation.isValid || !validation.value) {
      throw new ValidationError('Invalid user payload', validation.issues);
    }

    const changes = validation.value as unknown as UpdateUserInput;
    const current = await this.userRepository.findById(validId);
    if (!current) {
      throw new NotFoundError('User');
    }

    const merged: UpdateUserInput = {
      firstName: changes.firstName ?? current.first_name,
      lastName: changes.lastName ?? current.last_name,
      email: changes.email ?? current.email,
      age: changes.age !== undefined ? changes.age : current.age,
    };

    await this.assertEmailAvailable(merged.email as string, validId);

    const updated = User.fromRow(current).update(merged);

    const row = await this.userRepository.update(validId, {
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      age: updated.age,
    });

    if (!row) {
      throw new NotFoundError('User');
    }

    this.logger.info('User updated', { id: validId });

    return User.fromRow(row).toDto();
  }

  public async deleteUser(id: string): Promise<void> {
    const validId = this.validator.validateId(id);
    const deleted = await this.userRepository.delete(validId);

    if (!deleted) {
      throw new NotFoundError('User');
    }

    this.logger.info('User deleted', { id: validId });
  }

  private async assertEmailAvailable(email: string, ownerId?: string): Promise<void> {
    const existing = await this.userRepository.findByEmail(email.toLowerCase());

    if (existing && existing.id !== ownerId) {
      throw new ConflictError('Email is already registered');
    }
  }
}