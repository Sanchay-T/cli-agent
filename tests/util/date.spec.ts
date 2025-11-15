import { describe, expect, it } from 'vitest';
import { formatDate } from '../../src/util/date.js';

describe('formatDate', () => {
  it('formats a date to YYYY-MM-DD format', () => {
    const date = new Date(2024, 2, 15); // Month is 0-indexed, so 2 = March
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-03-15');
  });

  it('pads single-digit months with zero', () => {
    const date = new Date(2024, 0, 15); // Month 0 = January
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-01-15');
  });

  it('pads single-digit days with zero', () => {
    const date = new Date(2024, 2, 5); // Month 2 = March
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-03-05');
  });

  it('handles dates with both single-digit month and day', () => {
    const date = new Date(2024, 0, 5); // Month 0 = January
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-01-05');
  });

  it('handles dates with double-digit month and day', () => {
    const date = new Date(2024, 11, 31); // Month 11 = December
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-12-31');
  });

  it('handles leap year dates', () => {
    const date = new Date(2024, 1, 29); // Month 1 = February
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-02-29');
  });

  it('handles the start of a year', () => {
    const date = new Date(2024, 0, 1); // Month 0 = January
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-01-01');
  });

  it('handles the end of a year', () => {
    const date = new Date(2024, 11, 31, 23, 59, 59); // Month is 0-indexed
    const formatted = formatDate(date);
    expect(formatted).toBe('2024-12-31');
  });

  it('handles dates from different centuries', () => {
    const date = new Date(1999, 11, 31); // Month 11 = December
    const formatted = formatDate(date);
    expect(formatted).toBe('1999-12-31');
  });
});
