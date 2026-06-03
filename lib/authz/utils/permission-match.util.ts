/**
 * Colon-separated, wildcard-aware permission matching.
 *
 * Semantics (separator: ':'):
 *  - exact match: `user:read` matches `user:read`
 *  - global wildcard: `*` matches anything
 *  - trailing wildcard: `user:*` matches `user:read`, `user:profile:write`, ...
 *  - single-segment wildcard: `user:*:read` matches `user:any:read` (one segment)
 *
 * `granted` is the permission the principal holds; `required` is what the
 * route/requirement demands.
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === required || granted === '*') {
    return true;
  }

  const g = granted.split(':');
  const r = required.split(':');

  for (let i = 0; i < g.length; i++) {
    const segment = g[i];

    if (segment === '*') {
      // trailing '*' consumes remaining required segments — require at least one
      if (i === g.length - 1) {
        return r.length > i;
      }
      // interior '*' matches exactly one required segment
      if (r[i] === undefined) {
        return false;
      }
      continue;
    }

    if (segment !== r[i]) {
      return false;
    }
  }

  return g.length === r.length;
}

/** True when any granted permission matches the required permission. */
export function hasPermission(granted: string[], required: string): boolean {
  return granted.some((g) => permissionMatches(g, required));
}

/** True when every required permission is matched by some granted permission. */
export function hasAllPermissions(granted: string[], required: string[]): boolean {
  return required.every((req) => hasPermission(granted, req));
}

/** True when at least one required permission is matched by some granted permission. */
export function hasAnyPermission(granted: string[], required: string[]): boolean {
  return required.some((req) => hasPermission(granted, req));
}
