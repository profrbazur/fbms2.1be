import mongoose from 'mongoose';
import { HEX_COLOR_PATTERN } from '../utils/validationPatterns.js';

export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
export const TIME_FORMATS = ['12h', '24h'];

/**
 * Singleton document — exactly one record should ever exist. Retrieval
 * and update go through organizationService's findOneOrCreate-style
 * helper rather than trusting an :id from the client (see
 * docs/API_CONTRACT.md's GET/PATCH /api/v1/organization, which take no
 * identifier).
 *
 * P8.0 (System Settings) extends this same singleton — reused, not
 * duplicated, per that phase's explicit "do not introduce duplicate
 * configuration sources" instruction — with logo upload metadata,
 * operational settings, and general display preferences. See
 * docs/DECISIONS.md (ADR-043) for why `GET/PATCH /api/v1/settings` is a
 * second route surface over this identical document rather than a
 * second collection.
 */
const organizationSettingsSchema = new mongoose.Schema(
  {
    universityName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    primaryColor: {
      type: String,
      required: true,
      trim: true,
      match: HEX_COLOR_PATTERN,
    },
    secondaryColor: {
      type: String,
      required: true,
      trim: true,
      match: HEX_COLOR_PATTERN,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    // P5.1: the only two OrganizationSettings fields the mobile
    // GET /api/v1/mobile/config endpoint reads. Added here (rather than
    // hardcoded in mobileService.js) so a Super Admin can eventually
    // tune them without a code change, consistent with every other
    // institution-wide setting already living on this singleton.
    mobileHeartbeatIntervalSeconds: {
      type: Number,
      required: true,
      min: 30,
      default: 300,
    },
    mobileMinAppVersion: {
      type: String,
      required: true,
      trim: true,
      default: '1.0.0',
    },
    // Logo metadata only (P8.0) — the actual file lives on local disk
    // under backend/uploads/logos/ (see uploadLogo.js); no cloud storage
    // in Version 1. logoUrl itself (above) is repurposed to hold the
    // served relative path (e.g. "/uploads/logos/logo-...-....png") once
    // an upload happens, alongside a manually-typed http(s) URL, which
    // GET/PATCH /api/v1/organization's own logoUrl field has already
    // supported unchanged since P3.0. Written only by
    // organizationService.setOrganizationLogo — never accepted directly
    // through either settings PATCH body (ADR-044).
    logoOriginalName: {
      type: String,
      trim: true,
      default: '',
    },
    logoUploadedAt: {
      type: Date,
      default: null,
    },
    // Operational settings (P8.0) — "must become the application's
    // configuration source, replace hardcoded values where appropriate."
    // feedbackSessionTimeoutSeconds has no current backend consumer
    // (Version 1's mobile feedback submission is a single atomic POST,
    // not a stateful session) — stored for the Android kiosk to read via
    // GET /api/v1/mobile/config (idle-reset timing), the same reasoning
    // mobileHeartbeatIntervalSeconds/mobileMinAppVersion already
    // established. defaultTrendWindowDays replaces
    // analyticsService.js's previously-hardcoded 7-day Feedback Trend
    // fallback (Dashboard/Reports). defaultPaginationSize is stored and
    // validated but deliberately not yet retrofitted into every existing
    // list endpoint's own `limit = 20` default — see ADR-046.
    feedbackSessionTimeoutSeconds: {
      type: Number,
      required: true,
      min: 30,
      max: 3600,
      default: 120,
    },
    defaultTrendWindowDays: {
      type: Number,
      required: true,
      enum: [7, 30],
      default: 7,
    },
    defaultPaginationSize: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 20,
    },
    // General display preferences (P8.0). Stored and validated, but not
    // wired into any date/time rendering across the app in this phase —
    // "No localization engine required" is read as explicit permission
    // not to build one; see ADR-047.
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: 'Asia/Manila',
    },
    dateFormat: {
      type: String,
      required: true,
      enum: DATE_FORMATS,
      default: 'YYYY-MM-DD',
    },
    timeFormat: {
      type: String,
      required: true,
      enum: TIME_FORMATS,
      default: '12h',
    },
  },
  { timestamps: true },
);

const OrganizationSettings = mongoose.model(
  'OrganizationSettings',
  organizationSettingsSchema,
);

export default OrganizationSettings;
