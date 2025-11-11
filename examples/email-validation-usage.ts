/**
 * Example usage of the isEmail validation function
 *
 * This file demonstrates how to use the email validation utilities
 * from src/util/validation.ts
 */

import { isEmail, extractEmailDomain, normalizeEmail } from '../src/util/validation';

// Example 1: Basic email validation
console.log('\n=== Basic Email Validation ===');
const emails = [
  'user@example.com',          // Valid
  'invalid.email',             // Invalid - no @
  'user@subdomain.example.com', // Valid
  'user..name@example.com',    // Invalid - consecutive dots
  'user@example',              // Invalid - no TLD
];

emails.forEach((email) => {
  console.log(`${email}: ${isEmail(email) ? '✓ Valid' : '✗ Invalid'}`);
});

// Example 2: Validating user input
console.log('\n=== Validating User Input ===');
function registerUser(email: string, username: string): boolean {
  if (!isEmail(email)) {
    console.log(`Error: Invalid email address "${email}"`);
    return false;
  }
  console.log(`✓ Successfully registered user "${username}" with email "${email}"`);
  return true;
}

registerUser('alice@company.com', 'alice');
registerUser('bob.invalid', 'bob');

// Example 3: Extracting domain from emails
console.log('\n=== Extracting Email Domains ===');
const emailsToExtract = [
  'admin@company.com',
  'support@mail.example.org',
  'user@subdomain.example.co.uk',
];

emailsToExtract.forEach((email) => {
  const domain = extractEmailDomain(email);
  console.log(`${email} → Domain: ${domain}`);
});

// Example 4: Normalizing emails
console.log('\n=== Normalizing Email Addresses ===');
const unnormalizedEmails = [
  '  User@Example.COM  ',
  'FiRsT.LaSt@COMPANY.ORG',
  'Admin@Subdomain.Example.Co.UK',
];

unnormalizedEmails.forEach((email) => {
  const normalized = normalizeEmail(email);
  console.log(`"${email}" → "${normalized}"`);
});

// Example 5: Form validation function
console.log('\n=== Form Validation Example ===');
interface ContactForm {
  name: string;
  email: string;
  message: string;
}

function validateContactForm(form: ContactForm): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!form.name || form.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!form.email || !isEmail(form.email)) {
    errors.push('Valid email address is required');
  }

  if (!form.message || form.message.trim().length === 0) {
    errors.push('Message is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Test valid form
const validForm: ContactForm = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  message: 'Hello, this is a test message.',
};

const validResult = validateContactForm(validForm);
console.log('Valid form:', validResult);

// Test invalid form
const invalidForm: ContactForm = {
  name: '',
  email: 'invalid.email',
  message: 'Test',
};

const invalidResult = validateContactForm(invalidForm);
console.log('Invalid form:', invalidResult);

// Example 6: Filtering valid emails from a list
console.log('\n=== Filtering Valid Emails ===');
const mixedEmails = [
  'alice@example.com',
  'bob@company',
  'charlie@subdomain.example.org',
  'invalid..email@test.com',
  'david+tag@mail.example.co.uk',
  'eve@',
];

const validEmails = mixedEmails.filter(isEmail);
console.log('Valid emails from mixed list:', validEmails);

// Example 7: Email domain whitelist check
console.log('\n=== Domain Whitelist Check ===');
const allowedDomains = ['company.com', 'example.org', 'trusted.io'];

function isEmailFromAllowedDomain(email: string): boolean {
  if (!isEmail(email)) {
    return false;
  }

  const domain = extractEmailDomain(email);
  return domain !== null && allowedDomains.includes(domain);
}

const testEmails = [
  'user@company.com',      // Allowed
  'admin@example.org',     // Allowed
  'guest@external.com',    // Not allowed
  'support@trusted.io',    // Allowed
];

testEmails.forEach((email) => {
  const allowed = isEmailFromAllowedDomain(email);
  console.log(`${email}: ${allowed ? '✓ Allowed' : '✗ Not allowed'}`);
});
