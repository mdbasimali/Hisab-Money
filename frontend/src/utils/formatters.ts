/**
 * Format a number as Indian Rupee currency.
 * e.g. 12500 → "₹12,500"  |  1250.5 → "₹1,250.50"
 */
export function formatINR(amount: number, showDecimals = false): string {
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  };
  return new Intl.NumberFormat('en-IN', options).format(amount);
}

/**
 * Format a date string to a readable Indian date format.
 * e.g. "2024-01-15T10:30:00Z" → "15 Jan 2024"
 */
export function formatDate(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString.trim());
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a timestamp to readable date and time in user's device timezone.
 * e.g. "2026-10-27T14:15:00.000Z" → "27 Oct 2026 • 7:45 PM"
 *
 * For legacy date-only records (e.g. "2026-10-27"), it safely returns
 * only the date (e.g. "27 Oct 2026") without fabricating an artificial time.
 */
export function formatDateTime(isoString?: string | null, language: string = 'en'): string {
  if (!isoString) return '';
  const trimmed = isoString.trim();

  // Handle pure date string (YYYY-MM-DD) without time
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return trimmed;

  const localeMap: Record<string, string> = {
    hi: 'hi-IN',
    bn: 'bn-IN',
    en: 'en-IN',
  };
  const locale = localeMap[language] || 'en-IN';

  const datePart = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (isDateOnly) {
    return datePart;
  }

  let timePart = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Ensure uppercase AM/PM in English
  if (locale === 'en-IN') {
    timePart = timePart.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
  }

  return `${datePart} • ${timePart}`;
}

/**
 * Format a date string to relative time.
 * e.g. "2 days ago", "Just now"
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(isoString);
}

/**
 * Get the initials from a full name.
 * e.g. "Raj Kumar" → "RK"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Sanitize a phone number string: keep only digits.
 */
export function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
