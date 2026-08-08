import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { getAuditLogList, getAuditLogDetail } from '../../controllers/auditLogController.js';

// Mounted at /api/v1/audit-logs per docs/API_CONTRACT.md (P8.1).
// Strictly read-only — no POST/PATCH/DELETE anywhere in this module,
// the same "immutable by omission" pattern Feedback established
// (ADR-027): audit records are only ever created internally by
// auditService.recordAuditEvent, never through a client-facing write
// endpoint. Super Admin only — a system-wide administrative/security
// feature, not department-scoped (see docs/API_CONTRACT.md's
// Authorization section) — Department Head/Personnel both receive 403.
const router = Router();

router.get('/', authenticate, authorizeRoles('super_admin'), getAuditLogList);
router.get('/:id', authenticate, authorizeRoles('super_admin'), getAuditLogDetail);

export default router;
