import pino, { type Logger as PinoLoggerType } from 'pino';
import type { ILogger, LogContext, LogLevel } from '../../application/ports/ILogger';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'secret',
  'cookie',
  'creditCard'
];

export interface PinoLoggerOptions {
  level: LogLevel;
  pretty: boolean;
  base: LogContext;
}

/**
 * Adaptador del puerto ILogger sobre Pino.
 * Emite JSON estructurado (CloudWatch friendly) y redacta datos sensibles.
 */
export class PinoLogger implements ILogger {
  private readonly logger: PinoLoggerType;
  private readonly options: PinoLoggerOptions;

  constructor(options: PinoLoggerOptions) {
    this.options = options;
    this.logger = options.pretty
      ? pino({
          level: options.level,
          base: options.base,
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
          },
        })
      : pino({
          level: options.level,
          base: options.base,
          redact: { paths: SENSITIVE_KEYS.map((key) => `*.${key}`), censor: '[REDACTED]' },
          timestamp: pino.stdTimeFunctions.isoTime,
        });
  }

  private log(level: Exclude<LogLevel, 'silent'>, message: string, context?: LogContext): void {
    this.logger[level](context ?? {}, message);
  }

  public fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  public trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }

  /** Crea un logger derivado con contexto persistente (patron Decorator + Singleton por request). */
  public child(context: LogContext): ILogger {
    return new PinoLogger({ ...this.options, base: { ...this.options.base, ...context } });
  }
}