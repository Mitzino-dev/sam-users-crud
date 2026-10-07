# 🦕 Users CRUD API — AWS SAM + Node 20 + TypeScript

## 📚 Stack

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

## 🏛️ Arquitectura

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

## 🔍 Endpoints

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

## 🎉 Puesta en marcha (local)

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

## λ Invocar la lambda directamente con un evento:

```bash
npm run invoke                                             # GET /users
sam local invoke UsersFunction -e events/create-user.json --docker-network sam-users-net
sam local invoke UsersFunction -e events/update-user.json --docker-network sam-users-net
sam local invoke UsersFunction -e events/delete-user.json --docker-network sam-users-net
```

## 🧪 Tests

```bash
npm test              # Pruebas unitarias
npm run test:coverage # Cobertura en domain/application/shared
npm run test:e2e      # smoke test contra la BD real (requiere npm run db:up)
```

Cobertura de lo que se prueba: value objects y reglas de negocio, sanitización, `ResponseBuilder`,
`ErrorMiddleware`, `RequestParser`, validador AJV (incluidos payloads maliciosos), `UserService`
con dobles de repositorio, repositorio Postgres (verificando que **todo** SQL va parametrizado) y
el enrutado del handler.

## 🚀 Despliegue

```bash
sam validate --lint
npm run build && sam deploy --guided
```

El template despliega la función (arm64, 512 MB, 15 s, X-Ray tracing), API Gateway regional con
throttling, logs groups con retención de 14 días y el permiso IAM mínimo para leer el secreto de BD.