import { describe, it, expect } from 'vitest';
import { isEmail, extractEmailDomain, normalizeEmail } from '../src/util/validation';

describe('isEmail', () => {
  describe('valid emails', () => {
    it('should accept simple valid email', () => {
      expect(isEmail('user@example.com')).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(isEmail('user@mail.example.com')).toBe(true);
    });

    it('should accept email with multiple subdomains', () => {
      expect(isEmail('user@mail.corp.example.com')).toBe(true);
    });

    it('should accept email with numbers', () => {
      expect(isEmail('user123@example456.com')).toBe(true);
    });

    it('should accept email with dots in local part', () => {
      expect(isEmail('first.last@example.com')).toBe(true);
    });

    it('should accept email with plus sign', () => {
      expect(isEmail('user+tag@example.com')).toBe(true);
    });

    it('should accept email with hyphen in local part', () => {
      expect(isEmail('user-name@example.com')).toBe(true);
    });

    it('should accept email with underscore in local part', () => {
      expect(isEmail('user_name@example.com')).toBe(true);
    });

    it('should accept email with hyphen in domain', () => {
      expect(isEmail('user@my-domain.com')).toBe(true);
    });

    it('should accept email with country code TLD', () => {
      expect(isEmail('user@example.co.uk')).toBe(true);
    });

    it('should accept email with long TLD', () => {
      expect(isEmail('user@example.museum')).toBe(true);
    });

    it('should accept single letter local part', () => {
      expect(isEmail('a@example.com')).toBe(true);
    });

    it('should accept complex valid email', () => {
      expect(isEmail('first.last+tag@subdomain.example.co.uk')).toBe(true);
    });
  });

  describe('invalid emails - missing or malformed @ symbol', () => {
    it('should reject email without @ symbol', () => {
      expect(isEmail('userexample.com')).toBe(false);
    });

    it('should reject email with multiple @ symbols', () => {
      expect(isEmail('user@@example.com')).toBe(false);
    });

    it('should reject email with @ at the start', () => {
      expect(isEmail('@example.com')).toBe(false);
    });

    it('should reject email with @ at the end', () => {
      expect(isEmail('user@')).toBe(false);
    });
  });

  describe('invalid emails - local part issues', () => {
    it('should reject email starting with dot', () => {
      expect(isEmail('.user@example.com')).toBe(false);
    });

    it('should reject email ending with dot before @', () => {
      expect(isEmail('user.@example.com')).toBe(false);
    });

    it('should reject email with consecutive dots', () => {
      expect(isEmail('user..name@example.com')).toBe(false);
    });

    it('should reject email with invalid characters in local part', () => {
      expect(isEmail('user#name@example.com')).toBe(false);
    });

    it('should reject email with spaces in local part', () => {
      expect(isEmail('user name@example.com')).toBe(false);
    });

    it('should reject email with local part exceeding 64 characters', () => {
      const longLocal = 'a'.repeat(65);
      expect(isEmail(`${longLocal}@example.com`)).toBe(false);
    });
  });

  describe('invalid emails - domain part issues', () => {
    it('should reject email without domain', () => {
      expect(isEmail('user@')).toBe(false);
    });

    it('should reject email without TLD', () => {
      expect(isEmail('user@example')).toBe(false);
    });

    it('should reject email with single character TLD', () => {
      expect(isEmail('user@example.c')).toBe(false);
    });

    it('should reject email starting with dot in domain', () => {
      expect(isEmail('user@.example.com')).toBe(false);
    });

    it('should reject email ending with dot', () => {
      expect(isEmail('user@example.com.')).toBe(false);
    });

    it('should reject email with consecutive dots in domain', () => {
      expect(isEmail('user@example..com')).toBe(false);
    });

    it('should reject email with hyphen at start of domain', () => {
      expect(isEmail('user@-example.com')).toBe(false);
    });

    it('should reject email with hyphen at end of domain', () => {
      expect(isEmail('user@example-.com')).toBe(false);
    });

    it('should reject email with hyphen at start of domain label', () => {
      expect(isEmail('user@sub.-example.com')).toBe(false);
    });

    it('should reject email with hyphen at end of domain label', () => {
      expect(isEmail('user@sub-.example.com')).toBe(false);
    });

    it('should reject email with invalid characters in domain', () => {
      expect(isEmail('user@exam_ple.com')).toBe(false);
    });

    it('should reject email with spaces in domain', () => {
      expect(isEmail('user@exam ple.com')).toBe(false);
    });

    it('should reject email with domain exceeding 255 characters', () => {
      const longDomain = 'a'.repeat(250);
      expect(isEmail(`user@${longDomain}.com`)).toBe(false);
    });

    it('should reject email with domain label exceeding 63 characters', () => {
      const longLabel = 'a'.repeat(64);
      expect(isEmail(`user@${longLabel}.com`)).toBe(false);
    });
  });

  describe('invalid emails - general issues', () => {
    it('should reject empty string', () => {
      expect(isEmail('')).toBe(false);
    });

    it('should reject whitespace only', () => {
      expect(isEmail('   ')).toBe(false);
    });

    it('should reject null (as string)', () => {
      expect(isEmail(null as any)).toBe(false);
    });

    it('should reject undefined (as string)', () => {
      expect(isEmail(undefined as any)).toBe(false);
    });

    it('should reject number', () => {
      expect(isEmail(123 as any)).toBe(false);
    });

    it('should reject object', () => {
      expect(isEmail({} as any)).toBe(false);
    });

    it('should reject email exceeding 320 characters total', () => {
      const longLocal = 'a'.repeat(64);
      const longDomain = 'b'.repeat(250) + '.com';
      expect(isEmail(`${longLocal}@${longDomain}`)).toBe(false);
    });
  });

  describe('edge cases with trimming', () => {
    it('should accept email with leading whitespace (after trim)', () => {
      expect(isEmail('  user@example.com')).toBe(true);
    });

    it('should accept email with trailing whitespace (after trim)', () => {
      expect(isEmail('user@example.com  ')).toBe(true);
    });

    it('should accept email with both leading and trailing whitespace (after trim)', () => {
      expect(isEmail('  user@example.com  ')).toBe(true);
    });
  });
});

describe('extractEmailDomain', () => {
  it('should extract domain from valid email', () => {
    expect(extractEmailDomain('user@example.com')).toBe('example.com');
  });

  it('should extract domain with subdomain', () => {
    expect(extractEmailDomain('user@mail.example.com')).toBe('mail.example.com');
  });

  it('should extract domain with country code TLD', () => {
    expect(extractEmailDomain('user@example.co.uk')).toBe('example.co.uk');
  });

  it('should return null for invalid email', () => {
    expect(extractEmailDomain('invalid.email')).toBe(null);
  });

  it('should return null for empty string', () => {
    expect(extractEmailDomain('')).toBe(null);
  });
});

describe('normalizeEmail', () => {
  it('should normalize email to lowercase', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('should normalize and trim email', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('should handle already lowercase email', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });

  it('should normalize mixed case email', () => {
    expect(normalizeEmail('FiRsT.LaSt@ExAmPlE.CoM')).toBe('first.last@example.com');
  });

  it('should return null for invalid email', () => {
    expect(normalizeEmail('invalid.email')).toBe(null);
  });

  it('should return null for empty string', () => {
    expect(normalizeEmail('')).toBe(null);
  });
});
