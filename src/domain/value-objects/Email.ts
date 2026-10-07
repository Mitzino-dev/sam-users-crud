import { ValidationError } from '../errors/AppError';
import { assertSafeString, stripControlCharacters } from '../../shared/utils/sanitize';

const EMAIL_REGEX = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_EMAIL_LENGTH = 150;

/**
 * Value Object: garanteiza que un email sea siempre valido y normalizado.
 * Inmutable, sin identidad propia (dos emails iguales son el mismo valor).
 */
export class Email {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(rawValue: string): Email {
    if (typeof rawValue !== 'string') {
      throw new ValidationError('Email must be a string', { field: 'email' });
    }

    const normalized = stripControlCharacters(rawValue).trim().toLowerCase();

    if (normalized.length === 0) {
      throw new ValidationError('Email cannot be empty', { field: 'email' });
    }
    if (normalized.length > MAX_EMAIL_LENGTH) {
      throw new ValidationError(`Email exceeds the maximum length of ${MAX_EMAIL_LENGTH}`, { field: 'email' });
    }
    if (!EMAIL_REGEX.test(normalized)) {
      throw new ValidationError('Email format is invalid', { field: 'email' });
    }

    assertSafeString(normalized, 'email', MAX_EMAIL_LENGTH);

    return new Email(normalized);
  }

  public equals(other: Email): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}