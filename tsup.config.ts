import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'lib/core/index.ts',
    'ddd/index': 'lib/ddd/index.ts',
    'database/index': 'lib/database/index.ts',
    'errors/index': 'lib/errors/index.ts',
    'openapi/index': 'lib/openapi/index.ts',
    'types/index': 'lib/types/index.ts',
    'validator/index': 'lib/validator/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/event-emitter',
    '@nestjs/swagger',
    '@nestjs/typeorm',
    'typeorm',
    'zod',
    'rxjs',
    'reflect-metadata',
    'nest-commander',
  ],
  treeshake: true,
  minify: false,
});
