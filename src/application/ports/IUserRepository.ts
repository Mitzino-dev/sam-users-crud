import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserRow
} from '../../types';

export const REPOSITORY_ERRORS = {
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN: 'REPOSITORY_ERROR',
} as const;

/**
 * Puerto de salida (Repository Pattern). El dominio/aplicacion depende de esta
 * abstraccion, nunca de Postgres directamente (inversion de dependencias).
 */
export interface IUserRepository {
  create(input: CreateUserInput): Promise<UserRow>;
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  findAll(query: ListUsersQuery): Promise<Paginated<UserRow>>;
  update(id: string, input: UpdateUserInput): Promise<UserRow | null>;
  delete(id: string): Promise<boolean>;
}