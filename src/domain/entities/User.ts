import { Email } from '../value-objects/Email';
import { Age } from '../value-objects/Age';
import { ValidationError } from '../errors/AppError';
import type { UserRow, UserDto } from '../../types';
import {
  assertSafeString,
  collapseWhitespace,
  stripControlCharacters
} from '../../shared/utils/sanitize';

const MAX_NAME_LENGTH = 100;
const NAME_PATTERN = /^[A-Za-zÀ-ÿ'.\- ]+$/;

export interface UserProps {
  id: string;
  firstName: string;
  lastName: string;
  email: Email;
  age: Age;
  createdAt: Date;
  updatedAt: Date;
}

export type NewUserProps = Omit<UserProps, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Entidad de dominio: encapsula invariantes y reglas de negocio.
 * Es inmutable: cualquier cambio devuelve una nueva instancia.
 */
export class User {
  private readonly props: UserProps;

  private constructor(props: UserProps) {
    this.props = props;
  }

  public static create(input: {
    firstName: string;
    lastName: string;
    email: string;
    age?: number | null;
  }): User {
    const now = new Date();
    return new User({
      id: '',
      firstName: User.normalizeName(input.firstName, 'firstName'),
      lastName: User.normalizeName(input.lastName, 'lastName'),
      email: Email.create(input.email),
      age: Age.create(input.age),
      createdAt: now,
      updatedAt: now,
    });
  }

  public static fromRow(row: UserRow): User {
    return new User({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: Email.create(row.email),
      age: Age.create(row.age),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  private static normalizeName(value: string, field: string): string {
    if (typeof value !== 'string') {
      throw new ValidationError(`Field "${field}" must be a string`, { field });
    }

    const cleaned = collapseWhitespace(stripControlCharacters(value));
    if (cleaned.length < 2) {
      throw new ValidationError(`Field "${field}" must have at least 2 characters`, { field });
    }

    assertSafeString(cleaned, field, MAX_NAME_LENGTH);

    if (!NAME_PATTERN.test(cleaned)) {
      throw new ValidationError(`Field "${field}" contains invalid characters`, { field });
    }

    return cleaned;
  }

  public get id(): string {
    return this.props.id;
  }

  public get firstName(): string {
    return this.props.firstName;
  }

  public get lastName(): string {
    return this.props.lastName;
  }

  public get email(): string {
    return this.props.email.value;
  }

  public get age(): number | null {
    return this.props.age.value;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  public withIdentity(id: string): User {
    return new User({ ...this.props, id });
  }

  public update(changes: {
    firstName?: string;
    lastName?: string;
    email?: string;
    age?: number | null;
  }): User {
    return new User({
      id: this.props.id,
      firstName: changes.firstName !== undefined ? User.normalizeName(changes.firstName, 'firstName') : this.props.firstName,
      lastName: changes.lastName !== undefined ? User.normalizeName(changes.lastName, 'lastName') : this.props.lastName,
      email: changes.email !== undefined ? Email.create(changes.email) : this.props.email,
      age: changes.age !== undefined ? Age.create(changes.age) : this.props.age,
      createdAt: this.props.createdAt,
      updatedAt: new Date(),
    });
  }

  public toDto(): UserDto {
    return {
      id: this.props.id,
      firstName: this.props.firstName,
      lastName: this.props.lastName,
      email: this.props.email.value,
      age: this.props.age.value,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }

  public equals(other: User): boolean {
    return this.props.id === other.props.id;
  }
}