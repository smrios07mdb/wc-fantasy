/**
 * PII write-guard predicate (T15-14R §3b). `manager.display_name` is display-only and leaked
 * email addresses across the app because the two write paths — the provisioning upsert and the
 * self-serve rename — only checked non-empty. This predicate lets both writers reject an
 * email-SHAPED display name at write time so the leak can never recur.
 *
 * FULL-STRING match only, on the trimmed value: a legit name that merely CONTAINS an "@"
 * (e.g. "n@cho") stays legal — real names have apostrophes, accents, and stylized characters.
 * Only a whole-string address (`local@domain.tld`, no internal whitespace) is treated as email.
 * `[^\s@]` forbids internal whitespace and stray "@", so trim is the only normalization needed.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}
