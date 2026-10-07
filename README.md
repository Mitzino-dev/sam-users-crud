# Users CRUD API — AWS SAM + Node 20 + TypeScript

CRUD de usuarios sobre API Gateway + Lambda + PostgreSQL, con arquitectura por capas (no monolítica),
POO, principios SOLID, validación con AJV, logging estructurado, manejo de errores y defensas
contra inyección SQL y otros vectores. Incluye Docker para la base de datos y pruebas unitarias con Vitest.

## Stack

| Pieza | Tecnología |
| --- | --- |
| IaC | AWS SAM CLI (`template.yaml`) |
| Runtime | Node.js 20 (arm64), bundling con esbuild |
| Lenguaje | TypeScript estricto (`strict: true`) |
| Base de datos | PostgreSQL 16 en Docker + RDS en AWS |
| Validación | AJV 8 + `ajv-formats` (JSON Schema) |
| Logging | Pino (JSON estructurado, redacción de secretos) |
| Tests | Vitest 5 + cobertura v8 |
| Seguridad | Consultas parametrizadas, whitelist, CSP de payloads, sanitización |

## Arquitectura

```
src/
├── domain/                 # Núcleo: no depende de nada externo (SRP, DIP)
│   ├── entities/User.ts              # Entidad rica + invariantes, inmutable
│   ├── value-objects/{Email,Age}.ts  # VO: validación y normalización
│   └── errors/AppError.ts            # Jerarquía de errores de dominio
├── application/            # Casos de uso (dependen de puertos, no de adapters)
│   ├── ports/{IUserRepository,ILogger,IUserValidator}.ts   # Interfaces (DIP)
│   └── services/UserService.ts       # Orquesta: validar → entidad → repo → DTO
├── infrastructure/         # Adapters (implementaciones concretas)
│   ├── repositories/PostgresUserRepository.ts   # Repository + SQL parametrizado
│   ├── db/Database.ts                           # Pool + Unit of Work (transacciones)
│   ├── validators/AjvUserValidator.ts           # AJV compile-once
│   ├── logging/PinoLogger.ts                    # Adapter del puerto ILogger
│   └── container/Container.ts                   # DI Container (Service Locator puntual)
├── shared/                 # Utilidades transversales
│   ├── middlewares/{RequestParser,ErrorMiddleware}.ts
│   ├── http/{responseBuilder,httpCodes}.ts
│   └── utils/{sanitize,uuid}.ts
├── handlers/usersHandler.ts        # Fachada HTTP: enruta, no decide negocio
├── config/index.ts                 # Configuración por entorno
└── types/index.ts                  # Contratos de datos compartidos
```

**Flujo de una petición:** `handler → RequestParser → ruta → UserService → AJV → User (dominio) →
UserRepository → PostgreSQL → DTO → ResponseBuilder`, con `ErrorMiddleware` envolviendo todo.

## Patrones de diseño y SOLID

| Patrón / Principio | Dónde se aplica |
| --- | --- |
| **Repository** | `IUserRepository` (contrato) + `PostgresUserRepository` (adapter) |
| **Ports & Adapters (Hexagonal)** | `domain` no importa nada de `infrastructure`; solo de puertos |
| **Dependency Injection** | `UserService` recibe sus 3 dependencias por constructor; `Container` las ensambla |
| **Strategy / Value Object** | `Email`, `Age`: encapsulan validación y normalización |
| **Facade** | `UsersHandler` simplifica el evento de API Gateway a un `RequestContext` |
| **Chain of Responsibility** | `ErrorMiddleware` normaliza cualquier excepción a una respuesta HTTP |
| **Singleton** | `Container.getInstance()` y el pool de conexiones reutilizado entre invocaciones |
| **Factory** | `UsersHandler.fromContainer(...)`, `User.create(...)`, `PinoLogger.child(...)` |
| **Decorator** | `PinoLogger.child()` añade contexto sin mutar el logger padre |
| **SRP** | Handler (transporte), Service (casos de uso), Entity (reglas), Repo (persistencia), Validator (esquemas) |
| **OCP** | Añadir rutas/validaciones no obliga a modificar las existentes; `IUserRepository` permite cambiar Postgres por DynamoDB |
| **LSP** | `PinoLogger` y los dobles de test cumplen el mismo contrato `ILogger` |
| **ISP** | Interfaces pequeñas y específicas (`ILogger`, `IUserValidator`, `IUserRepository`) |
| **DIP** | La capa de aplicación depende de abstracciones; los detalles se inyectan desde `Container` |

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/users` | Lista paginada (`page`, `limit`, `search`, `sortBy`, `sortOrder`) |
| `POST` | `/users` | Crea un usuario |
| `GET` | `/users/{id}` | Obtiene un usuario por UUID |
| `PUT` | `/users/{id}` | Actualización parcial (merge) |
| `DELETE` | `/users/{id}` | Elimina un usuario |
| `GET` | `/health` | Health check de la lambda y la base de datos |

Envelope de respuesta uniforme:

```json
{ "success": true, "statusCode": 200, "data": { }, "requestId": "…", "timestamp": "…" }
{ "success": false, "statusCode": 422, "error": { "code": "VALIDATION_ERROR", "message": "…", "issues": [ ] } }
```

## Puesta en marcha (local)

```bash
cp .env.example .env          # ajustar HOST_DB_PORT si el 5432 está ocupado
npm install

npm run db:up                 # Postgres + red Docker "sam-users-net"
npm run build                 # bundle con esbuild -> dist/handlers/usersHandler.js
npm run dev                   # sam local start-api  (http://localhost:3000)

# En otra terminal
curl "http://localhost:3000/users?limit=5"
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Luis","lastName":"Perez","email":"luis.perez@test.com","age":33}'
```

Invocar la lambda directamente con un evento:

```bash
npm run invoke                                             # GET /users
sam local invoke UsersFunction -e events/create-user.json --docker-network sam-users-net
sam local invoke UsersFunction -e events/update-user.json --docker-network sam-users-net
sam local invoke UsersFunction -e events/delete-user.json --docker-network sam-users-net
```

### Tests

```bash
npm test              # Pruebas unitarias
npm run test:coverage # Cobertura en domain/application/shared
npm run test:e2e      # smoke test contra la BD real (requiere npm run db:up)
```

Cobertura de lo que se prueba: value objects y reglas de negocio, sanitización, `ResponseBuilder`,
`ErrorMiddleware`, `RequestParser`, validador AJV (incluidos payloads maliciosos), `UserService`
con dobles de repositorio, repositorio Postgres (verificando que **todo** SQL va parametrizado) y
el enrutado del handler.

## Medidas de seguridad

1. **Consultas parametrizadas (defensa principal).** Ningún valor del usuario se concatena en SQL:
   `WHERE id = $1`, `LIMIT $1 OFFSET $2`. Verificado en `tests/unit/PostgresUserRepository.test.ts`.
2. **Whitelist de columnas.** `sortBy` se traduce con un `Record` de columnas permitidas; un valor
   desconocido cae a `created_at` y nunca llega al SQL.
3. **Escape de wildcards.** `escapeLikePattern()` neutraliza `%` y `_` en las búsquedas.
4. **JSON Schema cerrado.** `additionalProperties: false` bloquea *mass assignment*
   (no se puede enviar `role: admin` ni `isAdmin`).
5. **Patrones restrictivos en AJV.** Los campos de texto rechazan `'`, `"`, backtick, `;`, `\`, `<`, `>`.
6. **Sanitización en el dominio.** Se eliminan caracteres de control, se colapsan espacios y se
   bloquean secuencias de inyección (comentarios SQL, `UNION SELECT`, `pg_sleep`, tautologías,
   enumeración de catálogos, inyección de plantillas/NoSQL/script).
7. **Validación de `Content-Type` y límite de tamaño** del body (256 KB) para reducir superficie de ataque.
8. **Errores sin fuga de información.** `ErrorMiddleware` nunca devuelve stack traces, SQL ni URIs
   de conexión; los 5xx se loguean con correlación y el cliente recibe `Internal server error`.
9. **Headers de seguridad**: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Cache-Control: no-store`.
10. **Rate limiting y access logs** configurados en API Gateway (`ThrottlingBurstLimit/RateLimit`, `DataTraceEnabled: false`).
11. **Credenciales en Secrets Manager** en producción (`DB_SECRET_ARN`), cacheadas en memoria;
    secretos redactados por Pino. Cero secretos en el repositorio.
12. **Dependencias auditadas**: `npm audit` con 0 vulnerabilidades.
13. **UUID v4 obligatorio** en el path: se valida antes de tocar la base de datos.
14. **Entorno mínimo**: TypeScript estricto, `noImplicitReturns`, `noUnusedLocals`.

## Despliegue

```bash
sam validate --lint
npm run build && sam deploy --guided
```

El template despliega la función (arm64, 512 MB, 15 s, X-Ray tracing), API Gateway regional con
throttling, logs groups con retención de 14 días y el permiso IAM mínimo para leer el secreto de BD.