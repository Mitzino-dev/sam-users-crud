import { describe, expect, it } from 'vitest';
import { AjvUserValidator } from '../../src/infrastructure/validators/AjvUserValidator';
import { ValidationError } from '../../src/domain/errors/AppError';

const validator = new AjvUserValidator();

describe('AjvUserValidator', () => {
  describe('validateCreateUser', () => {
    it('acepta un payload valido', () => {
      const result = validator.validateCreateUser({ firstName: 'Ana', lastName: 'Lopez', email: 'ana@test.com', age: 28 });

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('reporta multiples errores con el campo', () => {
      const result = validator.validateCreateUser({ firstName: 'A', lastName: '', email: 'x' });

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(1);
      expect(result.issues.map((i) => i.field)).toEqual(
        expect.arrayContaining(['firstName', 'lastName', 'email'])
      );
    });

    it('rechaza campos adicionales (mass assignment)', () => {
      const result = validator.validateCreateUser({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@test.com',
        role: 'admin',
      });

      expect(result.isValid).toBe(false);
    });

    it('rechaza strings con metacaracteres SQL', () => {
      const result = validator.validateCreateUser({
        firstName: "Ana'; DROP TABLE users; --",
        lastName: 'Lopez',
        email: 'ana@test.com',
      });

      expect(result.isValid).toBe(false);
      expect(result.issues[0].field).toBe('firstName');
    });

    it('rechaza edad fuera de rango o no entera', () => {
      expect(
        validator.validateCreateUser({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com', age: 999 }).isValid
      ).toBe(false);
      expect(
        validator.validateCreateUser({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com', age: 12.5 }).isValid
      ).toBe(false);
    });

    it('no coacciona tipos (coerceTypes: false)', () => {
      const result = validator.validateCreateUser({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com', age: '30' });
      expect(result.isValid).toBe(false);
    });

    it('acepta age null para borrado logico de campo', () => {
      const result = validator.validateCreateUser({ firstName: 'Ana', lastName: 'Lopez', email: 'a@t.com', age: null });
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateUpdateUser', () => {
    it('acepta actualizaciones parciales', () => {
      expect(validator.validateUpdateUser({ firstName: 'Ana Maria' }).isValid).toBe(true);
    });

    it('rechaza payloads vacios', () => {
      const result = validator.validateUpdateUser({});
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateId', () => {
    it('acepta un UUID valido', () => {
      expect(validator.validateId('11111111-1111-4111-8111-111111111111')).toBe(
        '11111111-1111-4111-8111-111111111111'
      );
    });

    it('rechaza UUID invalidos', () => {
      expect(() => validator.validateId('123')).toThrow(ValidationError);
      expect(() => validator.validateId("'; DROP TABLE users--")).toThrow(ValidationError);
    });
  });

  describe('validateListQuery', () => {
    it('aplica defaults de paginacion y orden', () => {
      const result = validator.validateListQuery({ page: 1, limit: 10 });

      expect(result.isValid).toBe(true);
      expect(result.value).toMatchObject({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' });
    });

    it('rechaza limit fuera de rango', () => {
      expect(validator.validateListQuery({ page: 1, limit: 5000 }).isValid).toBe(false);
    });

    it('rechaza sortBy fuera de la whitelist', () => {
      expect(validator.validateListQuery({ page: 1, limit: 10, sortBy: 'password; DROP' }).isValid).toBe(false);
    });

    it('rechaza search con inyeccion', () => {
      const result = validator.validateListQuery({ page: 1, limit: 10, search: "' OR 1=1 --" });
      expect(result.isValid).toBe(false);
    });
  });
});