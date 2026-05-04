import type { Type } from '@nestjs/common';

export interface ProviderWrapperLike {
  instance?: unknown;
  metatype?: Type<unknown>;
}

export interface ModuleProviderMap {
  providers: Map<unknown, ProviderWrapperLike>;
}

export interface NestContainerLike {
  getModules(): Map<unknown, ModuleProviderMap>;
}
