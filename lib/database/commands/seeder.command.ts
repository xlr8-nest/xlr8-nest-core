import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { SeederService } from '../services';

interface SeederCommandOptions {
  only?: string;
  transaction?: 'all' | 'each' | 'none';
  list?: boolean;
}

@Injectable()
@Command({
  name: 'seed',
  description: 'Run database seeders',
  options: { isDefault: false },
})
export class SeederCommandRunner extends CommandRunner {
  constructor(private readonly seederService: SeederService) {
    super();
  }

  async run(passedParams: string[], options?: SeederCommandOptions): Promise<void> {
    // Show available seeders
    if (options?.list) {
      this.showAvailableSeeders();
      return;
    }

    // Parse seeder names from passedParams or options
    const seederNames = this.parseSeederNames(passedParams, options);

    console.log('🌱 Starting database seeding...\n');

    const runOptions = {
      transaction: options?.transaction || 'all',
      only: seederNames.length > 0 ? seederNames : undefined,
      order: seederNames.length > 0 ? seederNames : undefined,
    };

    if (seederNames.length > 0) {
      console.log(`📋 Running specific seeders: ${seederNames.join(', ')}\n`);
    }

    await this.seederService.runSeeders(runOptions);
    console.log('\n🎉 All seeders completed successfully!');
  }

  @Option({
    flags: '-o, --only <seeders>',
    description: 'Run only specific seeders (comma-separated)',
  })
  parseOnly(val: string): string {
    return val;
  }

  @Option({
    flags: '-t, --transaction <mode>',
    description: 'Transaction mode: all, each, or none (default: all)',
  })
  parseTransaction(val: string): 'all' | 'each' | 'none' {
    if (!['all', 'each', 'none'].includes(val)) {
      throw new Error('Transaction mode must be: all, each, or none');
    }
    return val as 'all' | 'each' | 'none';
  }

  @Option({
    flags: '-l, --list',
    description: 'List all available seeders',
  })
  parseList(): boolean {
    return true;
  }

  private parseSeederNames(passedParams: string[], options?: SeederCommandOptions): string[] {
    const names: string[] = [];

    // From passedParams
    if (passedParams && passedParams.length > 0) {
      names.push(...passedParams);
    }

    // From --only option
    if (options?.only) {
      const onlyNames = options.only.split(',').map((name) => name.trim());
      names.push(...onlyNames);
    }

    // Remove duplicates
    return [...new Set(names)];
  }

  private showAvailableSeeders(): void {
    const seeders = this.seederService.getAvailableSeeders();

    console.log('📋 Available Seeders\n');

    if (seeders.length === 0) {
      console.log('  (no seeders configured)');
      return;
    }

    console.log(`  Total: ${seeders.length}\n`);
    seeders.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });

    console.log('\n💡 Usage:');
    console.log('  <prefix> seed                          # Run all seeders');
    console.log('  <prefix> seed -- UserSeeder            # Run specific seeder');
    console.log('  <prefix> seed -- UserSeeder RoleSeeder # Run multiple seeders');
    console.log('  <prefix> seed -- --only UserSeeder     # Alternative syntax');
    console.log('  <prefix> seed -- --list                # Show this list');
  }
}
