import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { OutboxAdminService } from './outbox-admin.service';

interface OutboxCommandOptions {
  name?: string;
  path?: string;
}

@Injectable()
@Command({
  name: 'outbox',
  description: 'Outbox event commands (migration, status, requeue)',
})
export class OutboxCommandRunner extends CommandRunner {
  constructor(private readonly admin: OutboxAdminService) {
    super();
  }

  async run(passedParams: string[], options?: OutboxCommandOptions): Promise<void> {
    const command = passedParams[0];

    switch (command) {
      case 'migration':
      case 'generate-migration':
        await this.generateMigration(options);
        break;

      case 'status':
        await this.showStatus();
        break;

      case 'requeue':
      case 'requeue-failed':
        await this.requeueFailed();
        break;

      default:
        this.showHelp();
        break;
    }
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Migration class / file name stem (default: CreateOutboxEvents)',
  })
  parseName(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --path <path>',
    description: 'Migrations folder. Falls back to DatabaseModuleConfig.migration.migrationsPath',
  })
  parsePath(val: string): string {
    return val;
  }

  private async generateMigration(options?: OutboxCommandOptions): Promise<void> {
    try {
      const { filePath, fileName } = await this.admin.generateMigration({
        name: options?.name,
        path: options?.path,
      });
      console.log('✅ Outbox migration generated successfully!');
      console.log(`📂 File: ${fileName}`);
      console.log(`📍 Path: ${filePath}`);
      console.log('\n💡 Next steps:');
      console.log('  1. Review the generated file');
      console.log('  2. Run: <prefix> migration run');
    } catch (err) {
      console.error('❌ Error:', (err as Error).message);
      process.exit(1);
    }
  }

  private async showStatus(): Promise<void> {
    const stats = await this.admin.getStats();
    console.log('📊 Outbox Status\n');
    console.log(`  Pending:   ${stats.pending}`);
    console.log(`  Published: ${stats.published}`);
    console.log(`  Failed:    ${stats.failed}`);
    console.log(`  Due now:   ${stats.dueNow}  (will be picked up by the next worker tick)`);
    if (stats.failed > 0) {
      console.log('\n⚠️  There are failed events. Inspect them, then run:');
      console.log('     <prefix> outbox requeue-failed');
    }
  }

  private async requeueFailed(): Promise<void> {
    const requeued = await this.admin.requeueFailed();
    if (requeued === 0) {
      console.log('✅ No FAILED events to re-queue.');
    } else {
      console.log(`✅ Re-queued ${requeued} failed event(s) for immediate retry.`);
    }
  }

  private showHelp(): void {
    console.log('📚 Outbox CLI\n');
    console.log('Available commands:');
    console.log('  <prefix> outbox migration             Generate the outbox_events table migration');
    console.log('  <prefix> outbox status                Show counts (pending / published / failed / due-now)');
    console.log('  <prefix> outbox requeue-failed        Reset FAILED rows back to PENDING (retry count = 0)');
    console.log('\nOptions for `migration`:');
    console.log('  -n, --name <name>    Class / file name stem (default: CreateOutboxEvents)');
    console.log('  -p, --path <path>    Override the migrations folder');
    console.log('\nExamples:');
    console.log('  <prefix> outbox migration');
    console.log('  <prefix> outbox migration --name AddOutboxTable');
    console.log('  <prefix> outbox migration --path ./src/db/migrations');
    console.log('  <prefix> outbox status');
    console.log('  <prefix> outbox requeue-failed');
  }
}
