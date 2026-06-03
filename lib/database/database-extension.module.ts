import { DynamicModule, Logger, Module, OnModuleInit, Inject } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { FactoryProvider, Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import type { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { IUnitOfWorkToken, type DatabaseModuleConfig } from './types';
import { MigrationService, SeederService } from './services';
import { MigrationCommandRunner, SeederCommandRunner } from './commands';
import { DATABASE_MODULE_CONFIG } from './constants';
import { TypeOrmClient } from './providers';

export interface DatabaseExtensionAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider<DatabaseModuleConfig>['inject'];
  useFactory: (
    ...args: unknown[]
  ) => Promise<DatabaseModuleConfig> | DatabaseModuleConfig;
  global?: boolean;
  /**
   * Explicitly enable the migration service + CLI runner.
   * When omitted the value comes from `config.migration?.enabled`.
   */
  migration?: boolean;
  /**
   * Explicitly enable the seeder service + CLI runner.
   * When omitted the value comes from `config.seeder?.enabled`.
   */
  seeder?: boolean;
}

type MutableTypeOrmModuleOptions = TypeOrmModuleOptions & {
  migrations?: string[];
  migrationsTableName?: string;
};

const typeOrmClientProviders: Provider[] = [
  {
    provide: IUnitOfWorkToken,
    useExisting: TypeOrmClient,
  },
  TypeOrmClient,
];

@Module({})
export class DatabaseExtensionModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseExtensionModule.name);

  constructor(
    @Inject(DATABASE_MODULE_CONFIG) private readonly config: DatabaseModuleConfig,
    private readonly migrationService?: MigrationService,
    private readonly seederService?: SeederService,
  ) {}

  async onModuleInit() {
    // Auto-run migrations if enabled — throws on failure so the app does not
    // boot against an un-migrated schema.
    if (this.config.migration?.autoRun && this.migrationService) {
      this.logger.log('Running auto-migrations…');
      await this.migrationService.runMigrations();
      this.logger.log('Auto-migrations complete.');
    }

    // Auto-run seeders if enabled — throws on failure.
    if (this.config.seeder?.autoRun && this.seederService) {
      this.logger.log('Running auto-seeders…');
      await this.seederService.runSeeders();
      this.logger.log('Auto-seeders complete.');
    }
  }

  /**
   * Register database extension module with static configuration
   */
  static register(config: DatabaseModuleConfig, global = true): DynamicModule {
    const typeOrmOptions = this.buildTypeOrmOptions(config);

    const providers: Provider[] = [
      {
        provide: DATABASE_MODULE_CONFIG,
        useValue: config,
      },
      ...typeOrmClientProviders,
    ];

    const exportedProviders: NonNullable<ModuleMetadata['exports']> = [...typeOrmClientProviders];

    // Add migration service and command if enabled
    if (config.migration?.enabled) {
      providers.push(MigrationService, MigrationCommandRunner);
      exportedProviders.push(MigrationService, MigrationCommandRunner);
    }

    // Add seeder service and command if enabled
    if (config.seeder?.enabled) {
      providers.push(SeederService, SeederCommandRunner);
      exportedProviders.push(SeederService, SeederCommandRunner);
    }

    return {
      module: DatabaseExtensionModule,
      global,
      imports: [TypeOrmModule.forRoot(typeOrmOptions)],
      providers,
      exports: exportedProviders,
    };
  }

  /**
   * Register database extension module asynchronously.
   *
   * Use the `migration` and `seeder` flags to opt into the respective services
   * when you cannot determine availability from the factory config at
   * registration time (they default to false, matching the safe baseline).
   */
  static registerAsync(options: DatabaseExtensionAsyncOptions): DynamicModule {
    const enableMigration = options.migration ?? false;
    const enableSeeder = options.seeder ?? false;

    const providers: Provider[] = [
      {
        provide: DATABASE_MODULE_CONFIG,
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      ...typeOrmClientProviders,
    ];

    const extraProviders: Provider[] = [];
    const extraExports: NonNullable<ModuleMetadata['exports']> = [];

    if (enableMigration) {
      extraProviders.push(MigrationService, MigrationCommandRunner);
      extraExports.push(MigrationService, MigrationCommandRunner);
    }

    if (enableSeeder) {
      extraProviders.push(SeederService, SeederCommandRunner);
      extraExports.push(SeederService, SeederCommandRunner);
    }

    return {
      module: DatabaseExtensionModule,
      global: options.global ?? true,
      imports: [
        ...(options.imports || []),
        TypeOrmModule.forRootAsync({
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            return this.buildTypeOrmOptions(config);
          },
          inject: options.inject || [],
        }),
      ],
      providers: [...providers, ...extraProviders],
      exports: [DATABASE_MODULE_CONFIG, ...typeOrmClientProviders, ...extraExports],
    };
  }

  /**
   * Build TypeORM options from config
   */
  private static buildTypeOrmOptions(
    config: DatabaseModuleConfig
  ): TypeOrmModuleOptions {
    const { connection, entities, migration } = config;

    const options = {
      type: connection.type as TypeOrmModuleOptions['type'],
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
      // Let Nest automatically register entities declared via TypeOrmModule.forFeature
      // to avoid metadata lookup failures when glob patterns don't resolve on Windows.
      autoLoadEntities: true,
      entities,
      synchronize: connection.synchronize ?? false,
      logging: connection.logging ?? false,
    } as MutableTypeOrmModuleOptions;

    // Add migration configuration
    if (migration?.enabled && migration.migrationsPath) {
      options.migrations = [`${migration.migrationsPath}/*.{ts,js}`];
      options.migrationsTableName = migration.tableName || 'migrations';
    }

    return options;
  }
}
