import { describe, it, expect } from 'vitest';
import { shouldShrink } from '../../utils/shrinkFile';

describe('making uploads smaller', () => {
  it('shrinks only large photos and scans', () => {
    const mb = 1024 * 1024;
    expect(shouldShrink({ name: 'receipt.jpg', type: 'image/jpeg', size: 6 * mb })).toBe(true);
    expect(shouldShrink({ name: 'scan.PNG', type: '', size: 12 * mb })).toBe(true);
    expect(shouldShrink({ name: 'small.jpg', type: 'image/jpeg', size: 0.5 * mb })).toBe(false);
    expect(shouldShrink({ name: 'statement.pdf', type: 'application/pdf', size: 30 * mb })).toBe(false);
    expect(shouldShrink({ name: 'photo.heic', type: 'image/heic', size: 8 * mb })).toBe(false);
  });
});
