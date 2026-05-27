/**
 * gmail.gs — Gmail reading via GmailApp (no IMAP, no passwords)
 *
 * Apps Script's GmailApp runs with the user's own OAuth credentials —
 * nothing to configure beyond accepting the permission prompt on first run.
 */

/**
 * Fetches recent inbox threads and parses them into EmailData objects.
 *
 * @param {number} hoursBack  How many hours back to scan
 * @param {number} maxEmails  Cap on emails returned
 * @returns {EmailData[]}
 */
function fetchRecentEmails(hoursBack, maxEmails) {
  var query = 'newer_than:' + hoursBack + 'h in:inbox';
  var threads = GmailApp.search(query, 0, maxEmails);

  var emails = [];
  for (var i = 0; i < threads.length; i++) {
    try {
      var parsed = parseThread(threads[i]);
      if (parsed) emails.push(parsed);
    } catch (e) {
      Logger.log('Warning: failed to parse thread ' + i + ': ' + e.message);
    }
  }

  return emails;
}

/**
 * Parses a GmailThread into a plain EmailData object.
 *
 * @param {GmailThread} thread
 * @returns {EmailData|null}
 *
 * @typedef {Object} EmailData
 * @property {string} sender        Display name of the sender
 * @property {string} senderEmail   Extracted email address (lowercase)
 * @property {string} subject
 * @property {string} date          Formatted date string
 * @property {string} body          Plain text preview, truncated
 * @property {string} threadId      Gmail thread ID
 * @property {string} gmailUrl      Direct link to the thread in Gmail
 * @property {boolean} isThread     true if thread has multiple messages
 */
function parseThread(thread) {
  var messages = thread.getMessages();
  if (!messages || messages.length === 0) return null;

  // Use the most recent message for content
  var msg = messages[messages.length - 1];

  var fromRaw = msg.getFrom();
  var sender = extractDisplayName(fromRaw);
  var senderEmail = extractEmailAddress(fromRaw);
  var subject = thread.getFirstMessageSubject() || '(no subject)';
  var date = formatDate(msg.getDate());
  var threadId = thread.getId();

  // Get plain text body, fall back to stripping HTML
  var body = msg.getPlainBody();
  if (!body || body.trim() === '') {
    body = stripHtml(msg.getBody());
  }
  body = truncate(body.trim(), 800);

  return {
    sender: sender,
    senderEmail: senderEmail,
    subject: subject,
    date: date,
    body: body,
    threadId: threadId,
    gmailUrl: buildGmailUrl(threadId),
    isThread: messages.length > 1,
  };
}

/**
 * Splits emails into priority and other buckets.
 * Priority = sender's email matches any entry in priorityContacts.
 *
 * @param {EmailData[]} emails
 * @param {string[]} priorityContacts  Lowercase email addresses
 * @returns {{ priority: EmailData[], other: EmailData[] }}
 */
function classifyEmails(emails, priorityContacts) {
  var priority = [];
  var other = [];

  var contacts = (priorityContacts || []).map(function(c) {
    return c.toLowerCase();
  });

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    var isPriority = contacts.some(function(c) {
      return email.senderEmail.indexOf(c) !== -1 || c.indexOf(email.senderEmail) !== -1;
    });

    if (isPriority) {
      priority.push(email);
    } else {
      other.push(email);
    }
  }

  return { priority: priority, other: other };
}
