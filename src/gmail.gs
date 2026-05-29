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
function fetchRecentEmails(hoursBack, maxEmails, gmailSearch) {
  var query = gmailSearch || ('newer_than:' + hoursBack + 'h in:inbox');
  Logger.log('Gmail search: ' + query);
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
 * @property {string}   sender         Display name of the sender
 * @property {string}   senderEmail    Extracted email address (lowercase)
 * @property {string}   subject
 * @property {string}   date           Formatted date string
 * @property {string}   body           Plain text preview, truncated
 * @property {string}   threadId       Gmail thread ID
 * @property {string}   gmailUrl       Direct link to the thread in Gmail
 * @property {boolean}  isThread       true if thread has multiple messages
 * @property {string}   toRecipients   To: field of the latest message
 * @property {string}   ccRecipients   CC: field of the latest message
 * @property {string}   threadContext  Summary of prior messages in thread
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
  var maxBody = getConfig().MAX_BODY_CHARS || 2000;
  body = truncate(body.trim(), maxBody);

  // Extract To/CC and infer the user's role as recipient
  var toRecipients = '';
  var ccRecipients = '';
  try {
    toRecipients = msg.getHeader('To') || '';
    ccRecipients = msg.getHeader('Cc') || '';
  } catch (e) { /* some messages don't expose headers */ }

  var recipientRole = inferRecipientRole(toRecipients, ccRecipients, senderEmail);

  // Build thread context for multi-message threads (last 5 messages)
  var threadContext = '';
  if (messages.length > 1) {
    var contextMessages = messages.slice(Math.max(0, messages.length - 6), messages.length - 1); // exclude the latest (we have its full body)
    threadContext = contextMessages.map(function(m) {
      var from = extractDisplayName(m.getFrom());
      var snippet = m.getPlainBody() || stripHtml(m.getBody()) || '';
      snippet = truncate(snippet.trim(), 150);
      return from + ': ' + snippet;
    }).join(' → ');
    threadContext = truncate(threadContext, 800);
  }

  return {
    sender: sender,
    senderEmail: senderEmail,
    subject: subject,
    date: date,
    body: body,
    threadId: threadId,
    gmailUrl: buildGmailUrl(threadId),
    isThread: messages.length > 1,
    toRecipients: toRecipients,
    ccRecipients: ccRecipients,
    recipientRole: recipientRole,
    threadContext: threadContext,
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

/**
 * Infers the user's role as a recipient of this email.
 *
 * @param {string} toField     Raw To: header
 * @param {string} ccField     Raw CC: header
 * @param {string} senderEmail Sender's email (to detect self-sent/forwarded)
 * @returns {string} 'direct' | 'cc' | 'group' | 'self' | 'unknown'
 *   - direct: user is the sole or primary To: recipient
 *   - cc: user is in CC (not in To:)
 *   - group: user is one of many in To:
 *   - self: sender is the user (forwarded to self, or own sent mail)
 *   - unknown: couldn't determine
 */
function inferRecipientRole(toField, ccField, senderEmail) {
  var me;
  try {
    me = Session.getActiveUser().getEmail().toLowerCase();
  } catch (e) {
    return 'unknown';
  }

  // Self-sent (forwarded to self, or own email)
  if (senderEmail === me) return 'self';

  var toLower = (toField || '').toLowerCase();
  var ccLower = (ccField || '').toLowerCase();

  var inTo = toLower.indexOf(me) !== -1;
  var inCc = ccLower.indexOf(me) !== -1;

  if (inCc && !inTo) return 'cc';

  if (inTo) {
    // Count commas in To: to estimate number of recipients
    var toCount = toLower.split(',').length;
    return toCount > 3 ? 'group' : 'direct';
  }

  // BCC or some other routing — can't tell
  return 'unknown';
}

/**
 * Counts recent non-primary emails (Promotions, Social, Updates, Forums).
 * Used to give context when Primary is empty ("nothing important, but X other emails arrived").
 *
 * @param {number} hoursBack
 * @returns {number}
 */
function countNonPrimaryEmails(hoursBack) {
  try {
    var query = 'newer_than:' + hoursBack + 'h in:inbox -category:primary';
    var threads = GmailApp.search(query, 0, 100);
    return threads.length;
  } catch (e) {
    Logger.log('Non-primary count failed: ' + e.message);
    return 0;
  }
}

/**
 * Labels threads that the AI categorized as "skip" with an "Aurora/Skipped" label.
 * Creates the label if it doesn't exist.
 *
 * @param {EmailAnalysis[]} analyses  All analyzed emails
 */
function labelSkippedEmails(analyses) {
  var skipped = analyses.filter(function(a) { return a.category === 'skip'; });
  if (skipped.length === 0) return;

  try {
    var label = GmailApp.getUserLabelByName('Aurora/Skipped');
    if (!label) {
      label = GmailApp.createLabel('Aurora/Skipped');
      Logger.log('Created label: Aurora/Skipped');
    }

    skipped.forEach(function(a) {
      var thread = GmailApp.getThreadById(a.email.threadId);
      if (thread) thread.addLabel(label);
    });

    Logger.log('Labeled ' + skipped.length + ' threads as Aurora/Skipped');
  } catch (e) {
    Logger.log('Labeling failed: ' + e.message);
  }
}
