import type { LoggerOptions } from 'typeorm';
import type { SeederConstructor } from './seeder.interface';

export enum DatabaseType {
  POSTGRES = 'postgres',
  MYSQL = 'mysql',
  MARIADB = 'mariadb',
  SQLITE = 'sqlite',
  MSSQL = 'mssql',
}

export type TypeOrmClass = abstract new (...args: never[]) => object;
export type EntityDefinition = string | TypeOrmClass;
export type MigrationDefinition = string | TypeOrmClass;

export interface DatabaseConnectionConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  url?: string;
  synchronize?: boolean;
  logging?: LoggerOptions;
}

export interface MigrationConfig {
  enabled?: boolean;
  tableName?: string;
  migrationsPath?: string;
  autoRun?: boolean;
}

export interface SeederConfig {
  enabled?: boolean;
  seeds?: SeederConstructor[];
  autoRun?: boolean;
}

export interface DatabaseModuleConfig {
  connection: DatabaseConnectionConfig;
  entities: EntityDefinition[];
  migration?: MigrationConfig;
  seeder?: SeederConfig;
}
