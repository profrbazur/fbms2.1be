import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

/**
 * Local disk storage only (P8.0) — "Local uploads are acceptable for
 * Version 1... Do not implement cloud storage." Files live under
 * backend/uploads/logos/, served statically at /uploads (see app.js).
 * The directory is created eagerly at module load (not lazily per
 * request) so the first real upload never races a missing-directory
 * error.
 */
export const LOGO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'logos');
fs.mkdirSync(LOGO_UPLOAD_DIR, { recursive: true });

// PNG/JPEG/WEBP/SVG only — "prevent arbitrary file types". SVG is
// included because rawhtml/settings.html's own upload hint text says
// "PNG or SVG"; the same 2MB ceiling below is taken directly from that
// same hint rather than an invented number.
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, LOGO_UPLOAD_DIR);
  },
  filename(req, file, callback) {
    // Unique filename (never the client-supplied originalName) — avoids
    // path-traversal/collision risk entirely rather than sanitizing an
    // attacker-controlled string.
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `logo-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    callback(null, uniqueName);
  },
});

function fileFilter(req, file, callback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    callback(new ApiError(400, 'Logo must be a PNG, JPEG, WEBP, or SVG image.'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
});

/**
 * Wraps multer's single-file handler so every failure mode (wrong type,
 * too large, no file at all, or any other Multer error) reaches the
 * centralized error handler as a normal ApiError/400 — never an
 * unhandled exception or a raw Multer error object with no
 * `.statusCode` (which would otherwise fall through to a generic 500).
 */
export function uploadLogo(req, res, next) {
  upload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new ApiError(400, 'Logo file exceeds the 2MB size limit.'));
        return;
      }
      next(new ApiError(400, `Logo upload failed: ${err.message}`));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(new ApiError(400, 'A logo file is required.', [{ field: 'logo', message: 'logo file is required.' }]));
      return;
    }
    next();
  });
}
