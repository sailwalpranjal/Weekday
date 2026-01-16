import * as crypto from 'crypto';
import * as chrono from 'chrono-node';

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

/**
 * Parse "Added On" date with multiple format support
 * Handles: "03 Nov 6:15", "3/11/2025 06:15 AM", "YYYY-MM-DD HH:mm"
 * Timezone-less dates assume DEFAULT_TIMEZONE
 */
export function parseAddedOnDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  try {
    // Use chrono-node for permissive date parsing
    const parsed = chrono.parseDate(dateStr, {
      timezone: getTimezoneOffset(DEFAULT_TIMEZONE)
    });

    if (parsed) {
      // If year is not in the string and parsed year is default, set to current year
      if (!dateStr.match(/\d{4}/) && parsed.getFullYear() === 2013) {
        parsed.setFullYear(new Date().getFullYear());
      }
      return parsed;
    }

    const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{1,2}):(\d{2})/);
    if (match) {
      const [, day, month, hour, minute] = match;
      const monthMap: { [key: string]: number } = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      };
      const monthNum = monthMap[month];
      if (monthNum !== undefined) {
        const year = new Date().getFullYear();
        const date = new Date(year, monthNum, parseInt(day), parseInt(hour), parseInt(minute));
        return date;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error parsing date "${dateStr}":`, error);
    return null;
  }
}

/**
 * Get timezone offset for a given timezone name
 */
function getTimezoneOffset(timezone: string): number {
  if (timezone === 'Asia/Kolkata') {
    return 330; // minutes
  }
  return 0;
}

/**
 * Convert date to ISO string in UTC
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Calculate TAT in seconds between two dates
 */
export function calculateTAT(mailSentAt: Date, addedOn: Date): number {
  const diffMs = mailSentAt.getTime() - addedOn.getTime();
  return Math.round(diffMs / 1000);
}

/**
 * Generate idempotency key using SHA256
 * Format: SHA256(source_record_identifier || '|' || round_name || '|' || candidate_email)
 */
export function generateIdempotencyKey(
  sourceIdentifier: string,
  roundName: string,
  candidateEmail: string
): string {
  const data = `${sourceIdentifier}|${roundName}|${candidateEmail}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate URL format and check if it's from allowed domains
 */
export function validateUrl(url: string): { valid: boolean; unverifiedDomain?: boolean } {
  if (!url || typeof url !== 'string') return { valid: false };

  try {
    const urlObj = new URL(url.trim());

    // Check scheme
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return { valid: false };
    }

    // Check if domain is in allowlist
    const allowedDomains = ['calendly.com', 'cal.com', 'forms.gle'];
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return { valid: true, unverifiedDomain: true };
    }

    return { valid: true };
  } catch {
    return { valid: false };
  }
}

/**
 * Unique source record identifier from CSV row
 */
export function createSourceIdentifier(row: any, rowIndex: number): string {
  const company = row.Company || '';
  const candidate = row.Candidate || '';
  const candidateEmail = row['Candidate Email'] || '';
  const addedOn = row['Added On'] || '';

  return `${company}_${candidate}_${candidateEmail}_${addedOn}_${rowIndex}`;
}

/**
 * Check if date is in the future
 */
export function isInFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

export function removeBOM(str: string): string {
  if (str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
}
