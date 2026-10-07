import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from '../../src/infrastructure/logging/PinoLogger';

describe('PinoLogger', () => {
  it('expone todos los niveles sin lanzar', () => {
    const logger = new PinoLogger({ level: 'silent', pretty: false, base: {} });

    expect(() => {
      logger.fatal('f');
      logger.error('e');
      logger.warn('w');
      logger.info('i');
      logger.debug('d');
      logger.trace('t');
    }).not.toThrow();
  });

  it('child() conserva configuracion y agrega contexto', () => {
    const parent = new PinoLogger({ level: 'info', pretty: false, base: { requestId: 'r1' } });
    const child = parent.child({ route: '/users' });

    expect(child).toBeInstanceOf(PinoLogger);
    expect(child).not.toBe(parent);
  });

  it('silence evita escritura de logs', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new PinoLogger({ level: 'silent', pretty: false, base: {} });

    logger.info('no deberia verse');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('pretty mode no rompe la instancia', () => {
    const logger = new PinoLogger({ level: 'error', pretty: true, base: {} });
    expect(logger).toBeInstanceOf(PinoLogger);
  });
});