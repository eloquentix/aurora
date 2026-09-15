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
 * @returns {string} 'direct' | 'cc' | 'group' | 'self' | 'sent' | 'unknown'
 *   - direct: user is the sole or primary To: recipient
 *   - cc: user is in CC (not in To:)
 *   - group: user is one of many in To:
 *   - self: user sent this to themselves (forward-to-self, note-to-self)
 *   - sent: user wrote this to OTHER people (latest message in thread is theirs)
 *   - unknown: couldn't determine
 */
function inferRecipientRole(toField, ccField, senderEmail) {
  var me;
  try {
    me = Session.getActiveUser().getEmail().toLowerCase();
  } catch (e) {
    return 'unknown';
  }

  var toLower = (toField || '').toLowerCase();
  var ccLower = (ccField || '').toLowerCase();

  var inTo = toLower.indexOf(me) !== -1;
  var inCc = ccLower.indexOf(me) !== -1;

  // User is the sender: note-to-self only if nobody else is addressed
  if (senderEmail === me) {
    var others = (toLower + ',' + ccLower).split(',').filter(function(r) {
      r = r.trim();
      return r.length > 0 && r.indexOf(me) === -1;
    });
    return others.length === 0 ? 'self' : 'sent';
  }

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
 * Fetches the user's recently sent messages as compact one-liners.
 * Gives the AI memory of what the user asked for / replied to recently,
 * so incoming replies are read in context and already-handled items aren't
 * flagged again.
 *
 * @param {number} daysBack  How many days of sent mail to include
 * @param {number} maxItems  Cap on messages returned
 * @returns {SentItem[]}  Newest first
 *
 * @typedef {Object} SentItem
 * @property {string} date      Formatted date
 * @property {string} to        To: recipients (raw header, truncated)
 * @property {string} subject
 * @property {string} snippet   First ~200 chars of plain body
 * @property {string} threadId
 */
function fetchSentContext(daysBack, maxItems) {
  if (!daysBack || daysBack < 1) return [];
  var me;
  try {
    me = Session.getActiveUser().getEmail().toLowerCase();
  } catch (e) {
    return [];
  }

  var cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  var items = [];
  try {
    var threads = GmailApp.search('in:sent newer_than:' + daysBack + 'd', 0, maxItems);
    var msgLists = GmailApp.getMessagesForThreads(threads);
    for (var i = 0; i < msgLists.length; i++) {
      var msgs = msgLists[i];
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j];
        if (m.getDate() < cutoff) continue;
        if (extractEmailAddress(m.getFrom()) !== me) continue;
        var snippet = m.getPlainBody() || stripHtml(m.getBody()) || '';
        // Drop quoted reply tail — keep only what the user actually typed
        snippet = snippet.split(/\r?\n(On .{5,120} wrote:|-{3,} ?Forwarded|From: )/)[0];
        items.push({
          date: formatDate(m.getDate()),
          rawDate: m.getDate(),
          to: truncate(m.getTo() || '', 80),
          subject: m.getSubject() || '(no subject)',
          snippet: truncate(snippet.replace(/\s+/g, ' ').trim(), 200),
          threadId: threads[i].getId(),
        });
      }
    }
  } catch (e) {
    Logger.log('Sent context fetch failed: ' + e.message);
    return [];
  }

  items.sort(function(a, b) { return b.rawDate - a.rawDate; });
  return items.slice(0, maxItems);
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
