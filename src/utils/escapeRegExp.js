/**
 * Escapes regex special characters so user-supplied search text can be
 * safely interpolated into a `RegExp` (used for case-insensitive
 * "contains" search filters across departments/locations/personnel).
 */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
