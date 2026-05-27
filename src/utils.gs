/**
 * utils.gs — Shared utility functions
 */

/**
 * Escapes HTML special characters for safe inclusion in HTML email bodies.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips HTML tags from a string (for plain-text fallback).
 */
function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Truncates a string to maxLen characters, appending '...' if cut.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  str = String(str);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Formats a Date (or date string) as "Mon May 26, 10:30 AM".
 */
function formatDate(d) {
  try {
    var dt = (d instanceof Date) ? d : new Date(d);
    return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'EEE MMM d, h:mm a');
  } catch (e) {
    return String(d);
  }
}

/**
 * Returns today's date formatted as "Monday, May 26".
 */
function formatToday() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE, MMMM d');
}

/**
 * Extracts email address from a "Name <email>" string.
 * Returns the raw string if no angle-bracket pattern is found.
 */
function extractEmailAddress(fromStr) {
  if (!fromStr) return '';
  var match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : fromStr.toLowerCase().trim();
}

/**
 * Extracts the display name from a "Name <email>" string.
 * Returns the email address if no name part found.
 */
function extractDisplayName(fromStr) {
  if (!fromStr) return '';
  var match = fromStr.match(/^([^<]+)<[^>]+>/);
  if (match) return match[1].trim();
  return extractEmailAddress(fromStr);
}

/**
 * Builds a direct link to a Gmail thread.
 */
function buildGmailUrl(threadId) {
  return 'https://mail.google.com/mail/u/0/#inbox/' + threadId;
}

/**
 * Builds a mailto: URL pre-filled with recipient, subject, and body.
 * Truncates body to 1500 chars to avoid browser/client limits.
 */
function buildMailtoLink(toEmail, subject, body) {
  var safeBody = truncate(body || '', 1500);
  return 'mailto:' +
    encodeURIComponent(toEmail) +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(safeBody);
}

/**
 * Tries to parse JSON from a string that may include markdown fences or preamble.
 * Handles: bare JSON, ```json fences (with or without closing fence), leading prose.
 * Returns the parsed object, or null on failure.
 */
function safeJsonParse(text) {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) { /* continue */ }

  // Strip opening fence and everything before it, then try parsing
  // Handles both complete fences (``` ... ```) and truncated responses (no closing ```)
  var afterFence = text.replace(/^[\s\S]*?```(?:json)?\s*/, '').replace(/```[\s\S]*$/, '');
  if (afterFence !== text) {
    try {
      return JSON.parse(afterFence.trim());
    } catch (e) { /* continue */ }
  }

  // Extract first {...} block (handles leading/trailing prose)
  var braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (e) { /* continue */ }
  }

  // Last resort: find opening brace and parse as much as possible
  var start = text.indexOf('{');
  if (start !== -1) {
    try {
      return JSON.parse(text.slice(start));
    } catch (e) { /* continue */ }
  }

  return null;
}
