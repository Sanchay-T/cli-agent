import { describe, expect, it } from 'vitest';
import { isEmail } from '../src/util/validation.js';

describe('isEmail', () => {
  it('accepts valid email addresses', () => {
    const validEmails = [
      'simple@example.com',
      'very.common@example.com',
      'disposable.style.email.with+symbol@example.com',
      'customer/department=shipping@example.com',
      'john.doe@sub.domain.co.uk',
      '用户@例子.广告',
      'bücher@xn--bcher-kva.de',
      '"much.more unusual"@example.com',
      'much."more\\ unusual"@example.com',
      'user@[192.168.2.1]',
      'user@[IPv6:2001:db8::1]',
    ];

    for (const email of validEmails) {
      expect(isEmail(email), email).toBe(true);
    }
  });

  it('rejects invalid email addresses', () => {
    const invalidEmails = [
      '',
      'plainaddress',
      'user@',
      '@example.com',
      'user@example',
      'user@.example.com',
      'user@example..com',
      'user..two@example.com',
      'user@example.c',
      'user@-example.com',
      'user@example-.com',
      'user@exa_mple.com',
      'user@127.0.0.1',
      'user@[127.0.0.256]',
      'user@[IPv6:1234]',
      '"unbalanced@example.com',
      'user@example.com\n',
    ];

    for (const email of invalidEmails) {
      expect(isEmail(email), email).toBe(false);
    }
  });

  it('narrows the type when returning true', () => {
    const value: unknown = 'person@example.org';

    if (isEmail(value)) {
      const ensured: string = value;
      expect(ensured).toBe('person@example.org');
    } else {
      throw new Error('Expected the email to be valid for the type guard test.');
    }
  });
});
