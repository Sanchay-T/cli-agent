import { describe, expect, it } from 'vitest';
import { reverseString } from '../../src/util/string.js';

describe('reverseString', () => {
  it('reverses a basic ASCII string', () => {
    expect(reverseString('abc')).toBe('cba');
  });

  it('returns the same string when input is empty', () => {
    expect(reverseString('')).toBe('');
  });

  it('preserves Unicode code points', () => {
    expect(reverseString('👋🏽🙂')).toBe('🙂👋🏽');
  });
});
