import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseModuleConfig, DatabaseConnectionConfig, EntityDefinition, MigrationDefinition, SeederConstructor } from '../types';

/**
 * Unified database configuration that works with both NestJS module and CLI
 */
export interface UnifiedDatabaseConfig {
  connection: DatabaseConnectionConfig;
  entities: EntityDefinition[];
  migrations?: MigrationDefinition[];
  seeds?: SeederConstructor[];
  migrationsTableName?: string;
}

type MutableDataSourceOptions = DataSourceOptions & {
  migrationsTableName?: string;
};

/**
 * Convert unified config to TypeORM DataSource (for CLI)
 */
export function createDataSource(config: UnifiedDatabaseConfig): DataSource {
  const logging = config.connection.logging;
  const loggingOption: DataSourceOptions['logging'] =
    typeof logging === 'boolean' || Array.isArray(logging) || logging === 'all'
      ? logging
      : false;
  
  const options = {
    type: config.connection.type as DataSourceOptions['type'],
    host: config.connection.host,
    port: config.connection.port,
    username: config.connection.username,
    password: config.connection.password,
    database: config.connection.database,
    entities: config.entities as DataSourceOptions['entities'],
    migrations: config.migrations as DataSourceOptions['migrations'],
    synchronize: config.connection.synchronize ?? false,
    logging: loggingOption,
    migrationsTableName: config.migrationsTableName || 'migrations',
  } as MutableDataSourceOptions;

  return new DataSource(options);
}

/**
 * Convert unified config to DatabaseModuleConfig (for NestJS module)
 */
export function toDatabaseModuleConfig(
  config: UnifiedDatabaseConfig,
  options?: {
    migrationEnabled?: boolean;
    migrationAutoRun?: boolean;
    seederEnabled?: boolean;
    seederAutoRun?: boolean;
  }
): DatabaseModuleConfig {
  // Extract migrations path from array or function array
  let migrationsPath: string | undefined;
  if (config.migrations && Array.isArray(config.migrations) && config.migrations.length > 0) {
    const firstMigration = config.migrations[0];
    if (typeof firstMigration === 'string') {
      // Extract directory path from glob pattern
      migrationsPath = firstMigration.replace(/\/\*\*?\/.*$/, '');
    }
  }

  return {
    connection: config.connection,
    entities: config.entities,
    migration: config.migrations
      ? {
          enabled: options?.migrationEnabled ?? true,
          migrationsPath: migrationsPath,
          tableName: config.migrationsTableName || 'migrations',
          autoRun: options?.migrationAutoRun ?? false,
        }
      : undefined,
    seeder: config.seeds
      ? {
          enabled: options?.seederEnabled ?? true,
          seeds: config.seeds,
          autoRun: options?.seederAutoRun ?? false,
        }
      : undefined,
  };
}

/**
 * Create a unified config that can be used by both NestJS and CLI
 */
export function defineConfig(config: UnifiedDatabaseConfig): UnifiedDatabaseConfig {
  return config;
}
