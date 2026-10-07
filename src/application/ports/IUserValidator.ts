export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  value?: Record<string, unknown>;
  issues: ValidationIssue[];
}

/**
 * Puerto de validacion de entrada. La implementacion real usa AJV, pero el
 * servicio solo conoce esta interfaz (DIP -> testeable con dobles).
 */
export interface IUserValidator {
  validateCreateUser(input: unknown): ValidationResult;
  validateUpdateUser(input: unknown): ValidationResult;
  validateId(id: string): string;
}