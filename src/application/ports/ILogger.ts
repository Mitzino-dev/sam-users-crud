export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Puerto de logging: la aplicacion depende de la abstraccion, no de pino.
 * Permite sustituir el logger en pruebas unitarias.
 */
export interface ILogger {
  fatal(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  trace(message: string, context?: LogContext): void;
  child(context: LogContext): ILogger;
}