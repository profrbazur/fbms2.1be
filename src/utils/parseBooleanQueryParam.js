/**
 * Shared by every controller that accepts a tri-state boolean query
 * filter (`isActive`, `isPublished`, `isArchived`, ...) — a raw query
 * string is always `'true'`/`'false'`/absent, never a real boolean, so
 * this normalizes it into `true`/`false`/`undefined` (the shape every
 * service's own `filter.<field> = value` check expects) once, instead
 * of each controller redefining the identical three-line function.
 */
export function parseBooleanQueryParam(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
