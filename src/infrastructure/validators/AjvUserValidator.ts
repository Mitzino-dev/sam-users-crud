import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { IUserValidator, ValidationResult } from '../../application/ports/IUserValidator';
import { ValidationError } from '../../domain/errors/AppError';
import { isValidUuid } from '../../shared/utils/uuid';

const CONTROL_CHARS_PATTERN_REGEX = /[\u0000-\u001F\u007F]/;
const NO_SQL_META_PATTERN = '^[^"\'`;\\\\<>]*$';

const createUserSchema = {
  $id: 'createUser',
  type: 'object',
  additionalProperties: false,
  required: ['firstName', 'lastName', 'email'],
  properties: {
    firstName: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      pattern: NO_SQL_META_PATTERN,
    },
    lastName: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      pattern: NO_SQL_META_PATTERN,
    },
    email: { type: 'string', format: 'email', minLength: 5, maxLength: 150 },
    age: { type: ['integer', 'null'], minimum: 0, maximum: 120 },
  },
} as const;

const updateUserSchema = {
  $id: 'updateUser',
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    firstName: { type: 'string', minLength: 2, maxLength: 100, pattern: NO_SQL_META_PATTERN },
    lastName: { type: 'string', minLength: 2, maxLength: 100, pattern: NO_SQL_META_PATTERN },
    email: { type: 'string', format: 'email', minLength: 5, maxLength: 150 },
    age: { type: ['integer', 'null'], minimum: 0, maximum: 120 },
  },
} as const;

const listQuerySchema = {
  $id: 'listUsersQuery',
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    search: { type: 'string', minLength: 1, maxLength: 100, pattern: NO_SQL_META_PATTERN },
    sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'age'], default: 'createdAt' },
    sortOrder: { type: 'string', enum: ['ASC', 'DESC', 'asc', 'desc'], default: 'DESC' },
  },
} as const;

const mapErrors = (errors: ErrorObject[] | null | undefined): ValidationResult['issues'] =>
  (errors ?? []).map((error) => ({
    field: error.instancePath.replace(/^\//, '') || 'body',
    message: `${error.message ?? 'invalid'}${error.params && 'additionalProperty' in error.params ? ` (${String((error.params as { additionalProperty: string }).additionalProperty)})` : ''}`,
  }));

/**
 * Implementacion del puerto IUserValidator usando AJV (compile-once).
 * additionalProperties:false + patterns cierran la puerta a mass assignment
 * y a payloads con payloads SQL incrustados.
 */
export class AjvUserValidator implements IUserValidator {
  private readonly ajv: Ajv;
  private readonly createUserSchema: ValidateFunction;
  private readonly updateUserSchema: ValidateFunction;
  private readonly listQuerySchema: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      coerceTypes: false,
      useDefaults: true,
      removeAdditional: false,
      strict: true,
    });
    addFormats(this.ajv);

    this.createUserSchema = this.ajv.compile(createUserSchema);
    this.updateUserSchema = this.ajv.compile(updateUserSchema);
    this.listQuerySchema = this.ajv.compile(listQuerySchema);
  }

  public validateCreateUser(input: unknown): ValidationResult {
    const valid = this.createUserSchema(input);
    return valid
      ? { isValid: true, value: input as Record<string, unknown>, issues: [] }
      : { isValid: false, issues: mapErrors(this.createUserSchema.errors) };
  }

  public validateUpdateUser(input: unknown): ValidationResult {
    const valid = this.updateUserSchema(input);
    return valid
      ? { isValid: true, value: input as Record<string, unknown>, issues: [] }
      : { isValid: false, issues: mapErrors(this.updateUserSchema.errors) };
  }

  public validateId(id: string): string {
    if (CONTROL_CHARS_PATTERN_REGEX.test(id) || !isValidUuid(id)) {
      throw new ValidationError('id must be a valid UUID v4', { field: 'pathParameters.id' });
    }
    return id;
  }

  public validateListQuery(input: unknown): ValidationResult {
    const valid = this.listQuerySchema(input);
    return valid
      ? { isValid: true, value: input as Record<string, unknown>, issues: [] }
      : { isValid: false, issues: mapErrors(this.listQuerySchema.errors) };
  }
}