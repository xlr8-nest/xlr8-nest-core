import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { toKebabCase } from './string.util';

interface MigrationSql {
  upSqls: string[];
  downSqls: string[];
}

export const getMigrationTableName = (dataSource: DataSource): string => {
  const migrationConfig = dataSource.options.migrationsTableName;
  return migrationConfig ? String(migrationConfig) : 'migrations';
};

export const createMigrationFile = async (
  migrationsPath: string,
  name: string,
  migrationSql?: MigrationSql
): Promise<{
  filePath: string;
  fileName: string;
}> => {
  if (!name) {
    throw new Error('Migration name is required');
  }
  if (!migrationsPath) {
    throw new Error('Migrations path not configured');
  }

  const timestamp = Date.now().toString();
  const className = name.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `${timestamp}-${toKebabCase(name)}.ts`;
  const filePath = path.join(migrationsPath, fileName);

  const template = await getMigrationTemplate(className, parseInt(timestamp), migrationSql);
  if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

  fs.writeFileSync(filePath, template, 'utf8');

  return {
    filePath,
    fileName,
  }
}

const getMigrationTemplate = async (
  className: string,
  timestamp: number,
  migrationSql?: MigrationSql
): Promise<string> => {
  return `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className}${timestamp} implements MigrationInterface {
  name = '${className}${timestamp}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${migrationSql?.upSqls.join('\n') || '    // TODO: Write your migration here\n    // Example:\n    // await queryRunner.query(\'CREATE TABLE "example" ("id" SERIAL PRIMARY KEY, "name" VARCHAR(255) NOT NULL)\');'}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
${migrationSql?.downSqls.join('\n') || '    // TODO: Write your rollback here\n    // Example:\n    // await queryRunner.query(\'DROP TABLE "example"\');'}
  }
}
`;
};


