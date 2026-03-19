export enum DatabaseType {
  POSTGRES = 'postgres',
  MYSQL = 'mysql',
  MARIADB = 'mariadb',
  SQLITE = 'sqlite',
  MSSQL = 'mssql',
}

export interface DatabaseConnectionConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  url?: string;
  synchronize?: boolean;
  logging?: boolean | string[];
}

export interface MigrationConfig {
  enabled?: boolean;
  tableName?: string;
  migrationsPath?: string;
  autoRun?: boolean;
}

export interface SeederConfig {
  enabled?: boolean;
  seeds?: any[];  // Array of seeder class constructors
  autoRun?: boolean;
}

export interface DatabaseModuleConfig {
  connection: DatabaseConnectionConfig;
  entities: string[];
  migration?: MigrationConfig;
  seeder?: SeederConfig;
}
