# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Breaking: replaced semantic OpenAPI decorators with HTTP method-based decorators: `ApiPost`, `ApiGet`, `ApiPatch`, `ApiPut`, `ApiDelete`, and `ApiMethod`
- Added custom OpenAPI wrapper factories for both success and error responses while keeping the default wrapped response format
- Standardized OpenAPI error schemas so `errors` is documented as a field-keyed object map
- Added a new `response` submodule with type-safe builders for success responses and exception-filter error responses
- Made library error classes type-safe by removing `any` error payloads and adding `statusCode` to `BaseError`

### Migration
- `ApiCreate` -> `ApiPost`
- `ApiGetOne` -> `ApiGet`
- `ApiGetMany` -> `ApiGet(..., { isArray: true })`
- `ApiGetPaginated` -> `ApiGet(..., { paginated: true })`
- `ApiUpdate` -> `ApiPatch` or `ApiPut`
- `ApiAction` -> `ApiMethod`

## [0.1.3] - 2026-04-21

### Changed
- Added `@swc/core` to the build toolchain so `tsup` can preserve NestJS decorator metadata during compilation

### Fixed
- Fixed published builds losing `design:paramtypes` metadata required by NestJS dependency injection
- Fixed `nest-commander` command runners failing at runtime because injected services were `undefined`
- Fixed migration and seeder CLI commands in consumer apps built against the published package

## [0.1.0] - 2026-03-19

### Added
- Wide version compatibility support for NestJS (v9-v12), Swagger (v6-v11), Zod (v3-v5), RxJS (v7-v8)
- Comprehensive README with badges, version compatibility table, and detailed examples
- Quick start guides for all modules (DDD, Database, OpenAPI, Validator)
- Support for `@faker-js/faker` in dev dependencies

### Changed
- Updated all dev dependencies to latest versions:
  - @nestjs/common: 11.1.17
  - @nestjs/swagger: 11.2.6
  - @nestjs/typeorm: 11.0.0
  - @nestjs/event-emitter: 3.0.1
  - zod: 4.3.6
  - rxjs: 7.8.2
  - typeorm: 0.3.28

### Fixed
- Fixed TypeScript compilation errors in PaginationMetaSchema
- Added definite assignment assertions for required properties

## [0.0.1] - 2026-03-18

### Added
- Initial release
- DDD & CQRS module with AggregateRoot, Entity, ValueObject
- Command/Query buses with automatic handler discovery
- Domain event bus with Saga pattern support
- TypeORM extensions with Unit of Work pattern
- Migration & Seeder services with CLI commands
- OpenAPI decorators for standardized API documentation
- Zod validation integration with NestJS pipes
- Standardized error classes
- Full TypeScript support with comprehensive type definitions

[0.1.3]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/xlr8-nest/xlr8-nest-core/releases/tag/v0.0.1
[Unreleased]: https://github.com/xlr8-nest/xlr8-nest-core/compare/v0.1.3...HEAD
