import { ValidationError } from '../../domain/errors/AppError';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MULTIPLE_SPACES = /\s{2,}/g;

/**
 * Patrones retreated de ataque SQL/NoSQL. La defensa principal contra inyeccion
 * son las consultas parametrizadas del repositorio; esto es defensa en profundidad.
 */
const INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /(--|#)\s/, reason: 'SQL comment sequence' },
  { pattern: /\/\*/, reason: 'SQL block comment' },
  { pattern: /['"`;\\]/, reason: 'quote or statement delimiter' },
  { pattern: /\bunion\b[\s\S]*\bselect\b/i, reason: 'UNION SELECT statement' },
  { pattern: /\b(insert|update|delete|drop|alter|truncate|grant|revoke|exec|execute)\b\s+(into|from|table|database|user)\b/i, reason: 'DML/DDL statement' },
  { pattern: /\b(or|and)\b\s+[\w'"`]+\s*(=|<>|like|in)\s*[\s\S]*(or|and)\b/i, reason: 'tautology filter' },
  { pattern: /\b(sleep|benchmark|pg_sleep|waitfor|dbms_pipe|xp_cmdshell)\s*\(/i, reason: 'time based injection' },
  { pattern: /\b(information_schema|pg_catalog|pg_user|pg_shadow)\b/i, reason: 'catalog enumeration' },
  { pattern: /\$\{[^}]*\}|<%[^%]*%>|<\?php/i, reason: 'template or expression injection' },
  { pattern: /\b(script|javascript|onerror|onload|alert)\s*[:(=]/i, reason: 'script injection' },
  { pattern: /\{\s*"\$[^"]+"\s*:/, reason: 'NoSQL operator injection' },
];

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARS, '');
}

export function collapseWhitespace(value: string): string {
  return value.replace(MULTIPLE_SPACES, ' ').trim();
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function assertSafeString(value: string, field: string, maxLength = 255): void {
  if (value.length > maxLength) {
    throw new ValidationError(`Field "${field}" exceeds the maximum length of ${maxLength}`);
  }

  const match = INJECTION_PATTERNS.find(({ pattern }) => pattern.test(value));
  if (match) {
    throw new ValidationError(`Field "${field}" contains a forbidden sequence: ${match.reason}`, {
      field,
    });
  }
}

export function sanitizeString(
  value: unknown,
  field: string,
  maxLength = 255,
  options: { pattern?: RegExp } = {}
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`, { field });
  }

  const cleaned = collapseWhitespace(stripControlCharacters(value));

  if (options.pattern && !options.pattern.test(cleaned)) {
    throw new ValidationError(`Field "${field}" has an invalid format`, { field });
  }
  if (cleaned.length === 0) {
    throw new ValidationError(`Field "${field}" cannot be empty`, { field });
  }

  assertSafeString(cleaned, field, maxLength);
  return truncate(cleaned, maxLength);
}

export function sanitizeOptionalString(
  value: unknown,
  field: string,
  maxLength = 255,
  options: { pattern?: RegExp } = {}
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeString(value, field, maxLength, options);
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Copia profunda con saneado: evita prototype pollution (__proto__, constructor, prototype).
 */
export function sanitizeObject<T>(input: unknown): T {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input as T;
  }

  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (dangerousKeys.has(key)) continue;
    output[key] = value !== null && typeof value === 'object' ? sanitizeObject(value) : value;
  }

  return output as T;
}