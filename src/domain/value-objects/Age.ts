import { ValidationError } from '../errors/AppError';
import { assertSafeString, stripControlCharacters } from '../../shared/utils/sanitize';

const MIN_AGE = 0;
const MAX_AGE = 120;

/**
 * Value Object: edad valida dentro de rango de negocio.
 */
export class Age {
  public readonly value: number | null;

  private constructor(value: number | null) {
    this.value = value;
  }

  public static create(rawValue: number | string | null | undefined): Age {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return new Age(null);
    }

    if (typeof rawValue === 'string') {
      assertSafeString(stripControlCharacters(rawValue).trim(), 'age', 3);
    }

    const value = Number(rawValue);

    if (!Number.isInteger(value)) {
      throw new ValidationError('Age must be an integer', { field: 'age' });
    }
    if (value < MIN_AGE || value > MAX_AGE) {
      throw new ValidationError(`Age must be between ${MIN_AGE} and ${MAX_AGE}`, { field: 'age' });
    }

    return new Age(value);
  }

  public equals(other: Age): boolean {
    return this.value === other.value;
  }

  toJSON(): number | null {
    return this.value;
  }
}