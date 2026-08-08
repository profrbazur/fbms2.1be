/**
 * Regex literals shared across multiple validators/models that would
 * otherwise independently redefine the identical pattern. Each export
 * is imported under whatever locally-meaningful name a given file
 * already used (e.g. `DEVICE_CODE_PATTERN`, `EMPLOYEE_NUMBER_PATTERN`)
 * — this file centralizes the pattern itself, not its per-domain name.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * 2-20 letters, numbers, hyphens, or underscores — the shared shape
 * behind Department/Location `code`, Tablet `deviceCode`, and
 * Personnel `employeeNumber`.
 */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;
