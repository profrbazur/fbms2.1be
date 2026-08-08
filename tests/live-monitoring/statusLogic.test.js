import { describe, it, expect } from 'vitest';
import { computeTabletStatus } from '../../src/services/liveMonitoringService.js';

// Pure-function coverage of the one genuinely novel piece of business
// logic P6.2 introduces — no database required, unlike every other test
// in this directory (see tabletsList.test.js/tabletDetail.test.js/
// summary.test.js, which need a live MongoDB connection).
describe('computeTabletStatus', () => {
  const cutoffDate = new Date('2026-08-07T12:00:00.000Z');

  it('returns "inactive" when the tablet is deactivated, regardless of lastSeen', () => {
    const tablet = { isActive: false, lastSeen: new Date('2026-08-07T11:59:59.000Z') };
    expect(computeTabletStatus(tablet, cutoffDate)).toBe('inactive');
  });

  it('returns "inactive" even when lastSeen is recent (isActive always wins)', () => {
    const tablet = { isActive: false, lastSeen: new Date() };
    expect(computeTabletStatus(tablet, cutoffDate)).toBe('inactive');
  });

  it('returns "online" when active and lastSeen is at or after the cutoff', () => {
    const tablet = { isActive: true, lastSeen: new Date('2026-08-07T12:00:00.000Z') };
    expect(computeTabletStatus(tablet, cutoffDate)).toBe('online');

    const tabletLater = { isActive: true, lastSeen: new Date('2026-08-07T12:00:01.000Z') };
    expect(computeTabletStatus(tabletLater, cutoffDate)).toBe('online');
  });

  it('returns "offline" when active but lastSeen is before the cutoff', () => {
    const tablet = { isActive: true, lastSeen: new Date('2026-08-07T11:59:59.000Z') };
    expect(computeTabletStatus(tablet, cutoffDate)).toBe('offline');
  });

  it('returns "offline" when active and lastSeen has never been recorded (null)', () => {
    const tablet = { isActive: true, lastSeen: null };
    expect(computeTabletStatus(tablet, cutoffDate)).toBe('offline');
  });
});
