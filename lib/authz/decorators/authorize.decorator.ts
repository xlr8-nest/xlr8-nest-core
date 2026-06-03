import { AUTHZ_REQUIREMENTS_METADATA } from '../constants/metadata';
import type { AuthorizationRequirement } from '../types/requirement.type';

/**
 * Attaches authorization requirements to a route handler or controller class,
 * merging with any requirements already declared on the same target. This is
 * the primitive every authorization decorator composes — including custom ones.
 *
 * Requirements declared on the method and on the class are combined by the
 * guard (logical AND).
 *
 *     @Authorize(new RolesRequirement(['admin']), new PermissionsRequirement(['user:write']))
 *     @Post()
 *     create() {}
 */
export const Authorize = (
  ...requirements: AuthorizationRequirement[]
): MethodDecorator & ClassDecorator => {
  return ((
    target: object,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<unknown>,
  ) => {
    const metadataTarget =
      descriptor && descriptor.value ? (descriptor.value as object) : target;

    const existing: AuthorizationRequirement[] =
      Reflect.getMetadata(AUTHZ_REQUIREMENTS_METADATA, metadataTarget) ?? [];

    Reflect.defineMetadata(
      AUTHZ_REQUIREMENTS_METADATA,
      [...existing, ...requirements],
      metadataTarget,
    );

    return descriptor ?? target;
  }) as MethodDecorator & ClassDecorator;
};
