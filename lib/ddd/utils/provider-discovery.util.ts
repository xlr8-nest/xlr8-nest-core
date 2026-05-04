import type { ModuleRef } from '@nestjs/core';
import type { NestContainerLike, ProviderWrapperLike } from '../common/nest-provider.type';

interface ModuleRefWithContainer {
  container: NestContainerLike;
}

export function getModuleProviders(moduleRef: ModuleRef): Map<unknown, ProviderWrapperLike> {
  const { container } = moduleRef as unknown as ModuleRefWithContainer;

  return [...container.getModules().values()]
    .map((module) => module.providers)
    .reduce<Map<unknown, ProviderWrapperLike>>((providers, moduleProviders) => {
      moduleProviders.forEach((value, key) => providers.set(key, value));
      return providers;
    }, new Map<unknown, ProviderWrapperLike>());
}
