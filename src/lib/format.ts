/**
 * Utility functions for common UI patterns
 */

/**
 * Returns the plural form of a word based on count.
 * @param count - The number to check
 * @param singular - The singular form of the word
 * @param plural - The plural form (defaults to singular + 's')
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/**
 * Formats a count with its pluralized label.
 * @param count - The number to format
 * @param singular - The singular form of the word
 * @param plural - The plural form (defaults to singular + 's')
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
