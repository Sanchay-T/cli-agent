import { isIP } from 'node:net';

const ATOM_SEGMENT = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+$/u;
const QUOTED_SEGMENT = /^(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x00-\x7F])*$/;
const DOMAIN_LABEL = /^[\p{L}\p{N}-]+$/u;
const DOMAIN_TLD = /^(?:[\p{L}\p{N}]{2,}|xn--[\p{L}\p{N}-]{2,})$/iu;

function isValidQuotedSegment(segment: string): boolean {
  if (!(segment.startsWith('"') && segment.endsWith('"'))) {
    return false;
  }

  const inner = segment.slice(1, -1);
  return QUOTED_SEGMENT.test(inner);
}

function splitLocalSegments(local: string): string[] | null {
  const segments: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < local.length; i += 1) {
    const char = local[i];

    if (char === '\\') {
      if (i + 1 >= local.length) {
        return null;
      }

      current += char + local[i + 1];
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === '.' && !inQuotes) {
      segments.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    return null;
  }

  segments.push(current);
  return segments;
}

function isValidLocalPart(local: string): boolean {
  if (!local || local.length > 64) {
    return false;
  }

  if (local.startsWith('.') || local.endsWith('.')) {
    return false;
  }

  if (local.includes('..')) {
    return false;
  }

  const segments = splitLocalSegments(local);
  if (!segments) {
    return false;
  }

  if (segments.some((segment) => segment.length === 0)) {
    return false;
  }

  return segments.every((segment) => {
    if (!segment) {
      return false;
    }

    if (segment.startsWith('"') || segment.endsWith('"')) {
      return isValidQuotedSegment(segment);
    }

    return ATOM_SEGMENT.test(segment);
  });
}

function isValidDomainLabel(label: string): boolean {
  if (!label || label.length > 63) {
    return false;
  }

  if (label.startsWith('-') || label.endsWith('-')) {
    return false;
  }

  return DOMAIN_LABEL.test(label);
}

function isValidDomainLiteral(literal: string): boolean {
  if (!literal) {
    return false;
  }

  if (literal.startsWith('IPv6:')) {
    return isIP(literal.slice(5)) === 6;
  }

  return isIP(literal) === 4;
}

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) {
    return false;
  }

  if (domain.includes('..')) {
    return false;
  }

  if (domain.startsWith('[') && domain.endsWith(']')) {
    return isValidDomainLiteral(domain.slice(1, -1));
  }

  const labels = domain.split('.');
  if (labels.length < 2) {
    return false;
  }

  if (!labels.every(isValidDomainLabel)) {
    return false;
  }

  const tld = labels.at(-1);
  if (!tld) {
    return false;
  }

  if (!DOMAIN_TLD.test(tld)) {
    return false;
  }

  if (!/[\p{L}]/u.test(tld) && !tld.toLowerCase().startsWith('xn--')) {
    return false;
  }

  return true;
}

export function isEmail(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }

  if (trimmed !== value) {
    return false;
  }

  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1 || trimmed.indexOf('@', atIndex + 1) !== -1) {
    return false;
  }

  const [local, domain] = trimmed.split('@');
  if (!isValidLocalPart(local) || !isValidDomain(domain)) {
    return false;
  }

  return true;
}
