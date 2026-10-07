import { UserService, type IUserService } from '../../application/services/UserService';
import { AjvUserValidator } from '../validators/AjvUserValidator';
import { PostgresUserRepository } from '../repositories/PostgresUserRepository';
import { PinoLogger } from '../logging/PinoLogger';
import { loggerConfig } from '../../config';
import type { ILogger, LogLevel } from '../../application/ports/ILogger';

/**
 * Contenedor de inyeccion de dependencias (Service Locator puntual / Factory).
 * Unico lugar donde se conocen las implementaciones concretas: si mañana se
 * cambia Postgres por DynamoDB, solo cambia este archivo.
 * Todas las dependencias son singletons por container (se reutilizan entre invocaciones).
 */
export class Container {
  private static instance: Container | undefined;
  private readonly logger: ILogger;
  private readonly validator: AjvUserValidator;
  private readonly userRepository: PostgresUserRepository;
  private readonly userService: IUserService;

  private constructor(logger?: ILogger) {
    this.logger =
      logger ??
      new PinoLogger({ 
        level: loggerConfig.level as LogLevel,
        pretty: loggerConfig.pretty,
        base: {} 
      });
    this.validator = new AjvUserValidator();
    this.userRepository = new PostgresUserRepository(this.logger);
    this.userService = new UserService(this.userRepository, this.validator, this.logger);
  }

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  public getLogger(): ILogger {
    return this.logger;
  }

  public getUserService(): IUserService {
    return this.userService;
  }

  public getValidator(): AjvUserValidator {
    return this.validator;
  }
}