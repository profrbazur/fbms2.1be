import { ApiError } from './ApiError.js';

/**
 * Shared by any service filtering on a client-supplied date string
 * (Reports' dateFrom/dateTo — see analyticsService.js). Guards against an
 * unparseable string reaching a Mongo query as `Invalid Date`, which would
 * otherwise silently match nothing rather than failing loudly.
 */
export function parseFilterDate(value, field) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${field} must be a valid date.`, [
      { field, message: `${field} must be a valid ISO date string.` },
    ]);
  }
  return parsed;
}
