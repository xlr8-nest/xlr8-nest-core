import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { MigrationService } from '../services';

interface GenerateOptions {
  name?: string;
}

@Injectable()
@Command({
  name: 'migration',
  description: 'Database migration commands',
})
export class MigrationCommandRunner extends CommandRunner {
  constructor(private readonly migrationService: MigrationService) {
    super();
  }

  async run(passedParams: string[], _options?: GenerateOptions): Promise<void> {
    const command = passedParams[0];

    switch (command) {
      case 'run':
        await this.runMigrations();
        break;

      case 'revert':
        await this.revertMigration();
        break;

      case 'generate':
        await this.generateMigration(passedParams[1]);
        break;

      case 'create':
        await this.createMigration(passedParams[1]);
        break;

      case 'status':
        await this.showStatus();
        break;

      case 'pending':
        await this.showPending();
        break;

      case 'executed':
        await this.showExecuted();
        break;

      default:
        this.showHelp();
        break;
    }
  }

  private async runMigrations(): Promise<void> {
    console.log('🚀 Running migrations...\n');
    await this.migrationService.runMigrations();
  }

  private async revertMigration(): Promise<void> {
    console.log('⏮️  Reverting last migration...\n');
    await this.migrationService.revertMigration();
  }

  private async showStatus(): Promise<void> {
    await this.migrationService.showStatus();
  }

  private async showPending(): Promise<void> {
    console.log('📋 Pending Migrations\n');
    const hasPending = await this.migrationService.hasPendingMigrations();
    
    if (hasPending) {
      console.log('⚠️  There are pending migrations');
      console.log('Run: <prefix> migration run');
    } else {
      console.log('✅ No pending migrations');
    }
  }

  private async showExecuted(): Promise<void> {
    console.log('📜 Executed Migrations\n');
    const executed = await this.migrationService.getExecutedMigrations();

    if (executed.length > 0) {
      console.log(`Total: ${executed.length}\n`);
      executed.forEach((migration, index) => {
        const timestamp = typeof migration.timestamp === 'number'
          ? migration.timestamp
          : parseInt(migration.timestamp, 10);
        console.log(`${index + 1}. ${migration.name}`);
        console.log(`   Timestamp: ${new Date(timestamp).toISOString()}`);
      });
    } else {
      console.log('(no executed migrations)');
    }
  }

  private async generateMigration(name: string): Promise<void> {
    if (!name) {
      console.error('❌ Error: Migration name is required');
      console.log('Usage: <prefix> migration generate <MigrationName>');
      process.exit(1);
    }

    const filePath = await this.migrationService.generateMigration(name);
    console.log('✅ Migration generated successfully!');
    console.log(`📂 Path: ${filePath}`);
    console.log('\n💡 Next steps:');
    console.log('Run: <prefix> migration run');
  }

  private async createMigration(name: string): Promise<void> {
    if (!name) {
      console.error('❌ Error: Migration name is required');
      console.log('Usage: <prefix> migration generate <MigrationName>');
      process.exit(1);
    }

    const filePath = await this.migrationService.createMigration(name);
    console.log('✅ Migration created successfully!');
    console.log(`📂 Path: ${filePath}`);
    console.log('\n💡 Next steps:');
    console.log('1. Edit the migration file and add your changes');
    console.log('2. Run: <prefix> migration run');
  }

  private showHelp(): void {
    console.log('📚 Migration CLI\n');
    console.log('Available commands:');
    console.log('  <prefix> migration run         Run pending migrations');
    console.log('  <prefix> migration revert      Revert last migration');
    console.log('  <prefix> migration generate    Generate new migration');
    console.log('  <prefix> migration status      Show migration status');
    console.log('  <prefix> migration pending     Show pending migrations');
    console.log('  <prefix> migration executed    Show executed migrations');
    console.log('\nExamples:');
    console.log('  <prefix> migration generate CreateUsersTable');
    console.log('  <prefix> migration run');
    console.log('  <prefix> migration status');
  }
}
