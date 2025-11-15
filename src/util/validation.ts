/**
 * Validates if a string is a valid email address format
 *
 * This function performs comprehensive email validation according to RFC 5322 standards
 * with practical adjustments for common real-world email formats.
 *
 * Validation checks:
 * - Proper email structure (local@domain)
 * - Local part: alphanumeric, dots, hyphens, underscores, plus signs
 * - Local part cannot start or end with a dot
 * - No consecutive dots in local part
 * - Domain part must have at least one dot
 * - Domain labels are alphanumeric with hyphens
 * - TLD (top-level domain) must be at least 2 characters
 * - Maximum length constraints (local: 64 chars, domain: 255 chars, total: 320 chars)
 *
 * @param email - The string to validate as an email address
 * @returns true if the email is valid, false otherwise
 *
 * @example
 * ```typescript
 * isEmail('user@example.com') // true
 * isEmail('invalid.email') // false
 * isEmail('test+tag@subdomain.example.co.uk') // true
 * ```
 */
export function isEmail(email: string): boolean {
  // Check if email is a non-empty string
  if (typeof email !== 'string' || email.trim().length === 0) {
    return false;
  }

  // Trim whitespace
  email = email.trim();

  // Check maximum length (RFC 5321)
  if (email.length > 320) {
    return false;
  }

  // Check for exactly one @ symbol
  const atIndex = email.indexOf('@');
  const lastAtIndex = email.lastIndexOf('@');

  if (atIndex === -1 || atIndex !== lastAtIndex) {
    return false;
  }

  // Split into local and domain parts
  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex + 1);

  // Validate local part
  if (!isValidLocalPart(localPart)) {
    return false;
  }

  // Validate domain part
  if (!isValidDomainPart(domainPart)) {
    return false;
  }

  return true;
}

/**
 * Validates the local part (before @) of an email address
 *
 * @param local - The local part of the email
 * @returns true if valid, false otherwise
 */
function isValidLocalPart(local: string): boolean {
  // Check length (RFC 5321: max 64 characters)
  if (local.length === 0 || local.length > 64) {
    return false;
  }

  // Cannot start or end with a dot
  if (local.startsWith('.') || local.endsWith('.')) {
    return false;
  }

  // Cannot have consecutive dots
  if (local.includes('..')) {
    return false;
  }

  // Allowed characters: alphanumeric, dots, hyphens, underscores, plus signs
  // This regex covers the most common valid email characters
  const localPartRegex = /^[a-zA-Z0-9._+\-]+$/;

  return localPartRegex.test(local);
}

/**
 * Validates the domain part (after @) of an email address
 *
 * @param domain - The domain part of the email
 * @returns true if valid, false otherwise
 */
function isValidDomainPart(domain: string): boolean {
  // Check length (RFC 5321: max 255 characters)
  if (domain.length === 0 || domain.length > 255) {
    return false;
  }

  // Domain must contain at least one dot
  if (!domain.includes('.')) {
    return false;
  }

  // Cannot start or end with a dot or hyphen
  if (domain.startsWith('.') || domain.endsWith('.') ||
      domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }

  // Split domain into labels (separated by dots)
  const labels = domain.split('.');

  // Each label must be valid
  for (const label of labels) {
    if (!isValidDomainLabel(label)) {
      return false;
    }
  }

  // Last label (TLD) must be at least 2 characters
  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    return false;
  }

  return true;
}

/**
 * Validates a single domain label (part between dots)
 *
 * @param label - A domain label
 * @returns true if valid, false otherwise
 */
function isValidDomainLabel(label: string): boolean {
  // Label must not be empty
  if (label.length === 0) {
    return false;
  }

  // Label max length is 63 characters (RFC 1035)
  if (label.length > 63) {
    return false;
  }

  // Cannot start or end with a hyphen
  if (label.startsWith('-') || label.endsWith('-')) {
    return false;
  }

  // Must contain only alphanumeric characters and hyphens
  const labelRegex = /^[a-zA-Z0-9\-]+$/;

  return labelRegex.test(label);
}

/**
 * Additional utility: Extracts the domain from an email address
 *
 * @param email - The email address
 * @returns The domain part or null if invalid
 *
 * @example
 * ```typescript
 * extractEmailDomain('user@example.com') // 'example.com'
 * extractEmailDomain('invalid') // null
 * ```
 */
export function extractEmailDomain(email: string): string | null {
  if (!isEmail(email)) {
    return null;
  }

  const atIndex = email.lastIndexOf('@');
  return email.substring(atIndex + 1);
}

/**
 * Additional utility: Normalizes an email address to lowercase
 *
 * @param email - The email address
 * @returns Normalized email or null if invalid
 *
 * @example
 * ```typescript
 * normalizeEmail('User@Example.COM') // 'user@example.com'
 * normalizeEmail('invalid') // null
 * ```
 */
export function normalizeEmail(email: string): string | null {
  if (!isEmail(email)) {
    return null;
  }

  return email.toLowerCase().trim();
}
