/**
 * agent.gs — The agent orchestrator
 *
 * This is the heart of Aurora. An agent is:
 *   1. A persona with rules (SYSTEM_PROMPT)
 *   2. A loop over data (emails) that calls the AI
 *   3. A synthesis step that ties it all together
 *
 * Two functions:
 *   - analyzeEmail()           → per-email: category, summary, actions, reply
 *   - generateOverallSummary() → synthesize the day across all emails + calendar
 */

var SYSTEM_PROMPT = [
  'You are Aurora, an AI assistant that reads emails and produces concise, actionable briefings.',
  'You are briefing a busy CEO. Be direct, specific, and useful.',
  '',
  'CATEGORIZATION RULES:',
  '- "action": The email needs a reply, decision, approval, or follow-up. A real human wrote something that expects a response from the user.',
  '- "fyi": Worth knowing but no action needed. Invoices received, event updates, FYI messages, shipping notifications, payment confirmations.',
  '- "skip": Newsletters, promotional emails, marketing, LinkedIn digests, Medium digests, automated notifications,',
  '  security alerts (trusted device added, login from new location), subscription confirmations, app notifications.',
  '  Emails from "Aurora" or any AI briefing tool are always "skip".',
  '  When in doubt between fyi and skip, lean toward skip.',
  '',
  'FYI SUB-CATEGORIES (fyiCategory field):',
  '- "finance": Bank alerts, deposits, payments, invoices, balance notifications, billing reports.',
  '- "team": Messages from colleagues or teammates that are informational (not needing action).',
  '- "system": Security alerts, device notifications, service confirmations, automated reports.',
  '- "other": Anything else.',
  '',
  'OWNERSHIP — WHO OWES THE WORK (the "owner" field):',
  '- "you": the user personally has to do or decide something. Only these belong in their action list.',
  '- "someone_else": the work sits with another person. The user is waiting, not working.',
  '  This includes: the user already asked/delegated it (see the thread and the recent sent mail),',
  '  someone promised to send or do something, or a colleague owns the next step.',
  '- "unclear": genuinely cannot tell from the email.',
  '- Before you call anything an action for the user, ask: did the USER already hand this off?',
  '  A request the user made of someone else is that person\'s task, never the user\'s.',
  '- When owner is "someone_else", set waitingOn to who owes it (name or email as written in the email),',
  '  and phrase actionItems as what THEY owe ("Nata to send the signed contract"), not as the user\'s to-do.',
  '  Do NOT invent a chase-up task for the user unless the email itself is overdue or blocking.',
  '- Every actionItem under owner "you" must be something the user does with their own hands.',
  '',
  'REPLY RULES:',
  '- Only propose a reply for "action" emails where a human reply is clearly expected.',
  '- Match the LANGUAGE of the original email. Romanian stays Romanian. English stays English. Never translate.',
  '- Match the tone and formality of the sender. Casual → casual. Formal → formal.',
  '- For internal colleagues and people you clearly know well: be brief and casual. "Sure, sounds good." not "I acknowledge receipt of your message."',
  '- Write like a busy, competent professional — not like an AI. No "I hope this email finds you well."',
  '- Be concise. 1-3 sentences max. Get to the point.',
  '- If the email is part of a thread, acknowledge context from earlier messages.',
  '- proposedReply must be null for "fyi" and "skip" emails.',
  '- proposedReply must be null when owner is "someone_else" — the user is not the one who owes a response.',
  '',
  'CONTEXT AWARENESS:',
  '- The "To:" and "CC:" fields tell you who the email is addressed to.',
  '- If the user is in CC (not in To:), they probably don\'t need to reply — lean toward "fyi".',
  '- If the email was forwarded BY the user to themselves, summarize what the forwarded content is about.',
  '  Do NOT say "User forwarded..." — they know they did it. Say what the document/notification IS.',
  '- If the latest message was WRITTEN BY THE USER to other people (role "sent"), the user is the one asking,',
  '  not the one being asked. Never treat the user\'s own requests as requests TO the user.',
  '  Summarize as "You asked <recipient> for X" / "You sent <recipient> Y". The ball is in the recipient\'s court.',
  '  Category: "fyi" (fyiCategory "team" if a colleague) unless the user\'s own message states a follow-up they must do.',
  '  proposedReply must be null — the user cannot reply to themselves.',
  '- "Recent sent mail" lists what the user wrote in the last few days. Use it to:',
  '  (a) read incoming messages as replies to the user\'s earlier requests when subjects/people match,',
  '  (b) NOT flag as "action" something the user has already answered or handled,',
  '  (c) avoid proposing a reply that repeats what the user already said,',
  '  (d) spot DELEGATION: anything the user asked another person to do there is owned by that person.',
  '      If this email is about such a request, owner is "someone_else" and waitingOn is that person.',
  '- If a calendar invite already exists for something discussed in the email, the action may already be resolved.',
  '- For long threads, the threadContext shows prior messages. Use it to understand the conversation arc.',
  '',
  'SUMMARY RULES:',
  '- 1-2 sentences. Direct and specific.',
  '- For "skip" emails, one short phrase is enough ("Marketing promo from Leroy Merlin").',
  '- Never fabricate information not present in the email.',
  '- Always use second person ("you") when referring to the user, never third person with their name.',
].join('\n');

/**
 * Analyzes a single email. Returns structured output with category.
 *
 * @param {EmailData} emailData
 * @returns {EmailAnalysis}
 *
 * @typedef {Object} EmailAnalysis
 * @property {EmailData}    email          Original email data
 * @property {string}       category       'action' | 'fyi' | 'skip'
 * @property {string}       summary        1-2 sentence summary
 * @property {string[]}     actionItems    Specific actions (empty for fyi/skip)
 * @property {string|null}  proposedReply  Draft reply (null unless action)
 * @property {string|null}  skipReason     Why skipped (null if not skip)
 * @property {string}       fyiCategory    'finance' | 'team' | 'system' | 'other'
 * @property {string}       owner          'you' | 'someone_else' | 'unclear'
 * @property {string|null}  waitingOn      Who owes the work (null unless owner is someone_else)
 * @property {boolean}      error          true if AI call failed
 */
function analyzeEmail(emailData, sentContext) {
  var prompt = buildAnalysisPrompt(emailData, sentContext);

  var responseText;
  try {
    responseText = callAI(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.3,
    });
  } catch (e) {
    Logger.log('AI call failed for email from ' + emailData.senderEmail + ': ' + e.message);
    return {
      email: emailData,
      category: 'skip',
      summary: 'Could not analyze: ' + e.message,
      actionItems: [],
      proposedReply: null,
      skipReason: 'error',
      fyiCategory: 'other',
      owner: 'unclear',
      waitingOn: null,
      error: true,
    };
  }

  var parsed = safeJsonParse(responseText);

  if (!parsed) {
    Logger.log('JSON parse failed for response: ' + truncate(responseText, 200));
    return {
      email: emailData,
      category: 'skip',
      summary: 'Analysis failed (unparseable response)',
      actionItems: [],
      proposedReply: null,
      skipReason: 'error',
      fyiCategory: 'other',
      owner: 'unclear',
      waitingOn: null,
      error: true,
    };
  }

  var category = parsed.category || 'fyi';
  if (['action', 'fyi', 'skip'].indexOf(category) === -1) category = 'fyi';

  var fyiCategory = parsed.fyiCategory || 'other';
  if (['finance', 'team', 'system', 'other'].indexOf(fyiCategory) === -1) fyiCategory = 'other';

  var owner = parsed.owner || 'unclear';
  if (['you', 'someone_else', 'unclear'].indexOf(owner) === -1) owner = 'unclear';

  // The user wrote the latest message to other people — whatever it asks for,
  // they are not the one who owes it. The model gets this right most of the
  // time now, but the header is hard evidence, so don't leave it to chance.
  if (emailData.recipientRole === 'sent') owner = 'someone_else';

  var delegated = owner === 'someone_else';

  return {
    email: emailData,
    category: category,
    summary: parsed.summary || '',
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    // No reply to draft when the ball is in someone else's court.
    proposedReply: (category === 'action' && !delegated) ? (parsed.proposedReply || null) : null,
    skipReason: parsed.skipReason || null,
    fyiCategory: fyiCategory,
    owner: owner,
    waitingOn: delegated ? (parsed.waitingOn || inferWaitingOn(emailData)) : null,
    error: false,
  };
}

/**
 * Fallback for who we're waiting on when the model didn't name anyone.
 * For a message the user sent, that's the To: line; otherwise the sender.
 *
 * @param {EmailData} emailData
 * @returns {string|null}
 */
function inferWaitingOn(emailData) {
  if (emailData.recipientRole === 'sent' && emailData.toRecipients) {
    var first = emailData.toRecipients.split(',')[0];
    return extractDisplayName(first) || extractEmailAddress(first) || null;
  }
  return emailData.sender || null;
}

/**
 * Generates the overall briefing summary. Includes calendar and FYI context.
 *
 * @param {EmailAnalysis[]} analyses
 * @param {Object[]} [calendarEvents]  Today's calendar events (optional)
 * @returns {string}
 */
function generateOverallSummary(analyses, calendarEvents, sentContext) {
  if (!analyses || analyses.length === 0) {
    return 'Inbox is clear. Nothing new.';
  }

  var actionCount = 0, waitingCount = 0, fyiCount = 0, skipCount = 0;
  analyses.forEach(function(a) {
    if (a.category === 'action') {
      if (a.owner === 'someone_else') waitingCount++;
      else actionCount++;
    } else if (a.category === 'fyi') fyiCount++;
    else skipCount++;
  });

  // Build rich context for the AI
  var actionSummaries = analyses
    .filter(function(a) { return a.category === 'action' && a.owner !== 'someone_else'; })
    .map(function(a) { return '- ' + a.email.sender + ': ' + a.summary; });

  var waitingSummaries = analyses
    .filter(function(a) { return a.category === 'action' && a.owner === 'someone_else'; })
    .map(function(a) {
      return '- ' + (a.waitingOn ? a.waitingOn + ' owes: ' : '') + a.summary;
    });

  var fyiHighlights = analyses
    .filter(function(a) { return a.category === 'fyi'; })
    .map(function(a) { return '- [' + a.fyiCategory + '] ' + a.email.sender + ': ' + a.summary; });

  var calendarContext = '';
  if (calendarEvents && calendarEvents.length > 0) {
    calendarContext = '\n\nToday\'s calendar (' + calendarEvents.length + ' events):\n' +
      calendarEvents.map(function(e) {
        return '- ' + e.startTime + ': ' + e.title;
      }).join('\n');
  }

  var sentBlock = formatSentContext(sentContext);

  var prompt = [
    'Email stats: ' + actionCount + ' need attention, ' + waitingCount + ' waiting on others, ' +
      fyiCount + ' FYI, ' + skipCount + ' skipped.',
    '',
    actionCount > 0 ? 'Emails needing action FROM YOU:\n' + actionSummaries.join('\n') : 'Nothing needs action from you.',
    '',
    waitingSummaries.length > 0 ? 'Owed BY OTHER PEOPLE (you are waiting, do not tell me to do these):\n' +
      waitingSummaries.join('\n') : '',
    '',
    fyiHighlights.length > 0 ? 'FYI highlights:\n' + fyiHighlights.join('\n') : '',
    calendarContext,
    sentBlock ? '\n' + sentBlock : '',
    '',
    'Write a 2-4 sentence executive summary for a CEO\'s morning briefing.',
    'DO NOT just repeat the counts — I can see those myself.',
    'Instead: What are the 1-3 most important things I need to know right now?',
    'Mention specific money amounts if payments arrived or are due.',
    'Mention the first meeting of the day if there is one.',
    'Mention any deadlines or time-sensitive items.',
    'If you asked someone for something recently (see sent mail) and no reply has arrived, mention it as "still waiting on X".',
    'Never phrase something another person owes as a task for me. "Nata still owes the contract" — not "send the contract".',
    'Be direct, specific, and concise. No filler. No bullet points — just flowing prose.',
  ].join('\n');

  try {
    return callAI(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 300,
      temperature: 0.4,
    });
  } catch (e) {
    Logger.log('Overall summary failed: ' + e.message);
    var parts = [actionCount + ' need attention', fyiCount + ' worth reading', skipCount + ' skipped'];
    return parts.join('. ') + '.';
  }
}

/**
 * Translates recipientRole code into a human-readable description for the AI.
 */
function describeRecipientRole(role) {
  var descriptions = {
    'direct':  'Primary recipient (directly in To:)',
    'cc':      'CC\'d — not the primary recipient, just copied',
    'group':   'One of many recipients in a group email',
    'self':    'User sent/forwarded this to themselves (note-to-self)',
    'sent':    'USER IS THE AUTHOR — they wrote this to the people in To:/CC:. They are asking, not being asked.',
    'unknown': 'Unknown (possibly BCC or list)',
  };
  return descriptions[role] || descriptions['unknown'];
}

/**
 * Formats recent sent mail as a compact block for the AI.
 * Marks items belonging to the thread under analysis.
 *
 * @param {SentItem[]} sentContext
 * @param {string} [currentThreadId]
 * @returns {string}  '' if nothing to show
 */
function formatSentContext(sentContext, currentThreadId) {
  if (!sentContext || sentContext.length === 0) return '';
  var lines = sentContext.map(function(s) {
    var tag = (currentThreadId && s.threadId === currentThreadId) ? ' [SAME THREAD]' : '';
    return '- ' + s.date + ' → ' + s.to + ' | ' + s.subject + tag + ' | ' + s.snippet;
  });
  return 'Recent sent mail (what the user wrote recently, newest first):\n' + lines.join('\n');
}

/**
 * Builds the per-email analysis prompt with full context.
 */
function buildAnalysisPrompt(emailData, sentContext) {
  var parts = ['Analyze this email and return a JSON object.'];

  var sentBlock = formatSentContext(sentContext, emailData.threadId);
  if (sentBlock) {
    parts.push('');
    parts.push(sentBlock);
  }

  parts.push('');
  parts.push('Email:');
  parts.push('From: ' + emailData.sender + ' <' + emailData.senderEmail + '>');
  parts.push('To: ' + truncate(emailData.toRecipients || '', 200));
  if (emailData.ccRecipients) parts.push('CC: ' + truncate(emailData.ccRecipients, 200));
  parts.push('Subject: ' + emailData.subject);
  parts.push('Date: ' + emailData.date);
  parts.push('User\'s role: ' + describeRecipientRole(emailData.recipientRole));

  if (emailData.isThread && emailData.threadContext) {
    parts.push('');
    parts.push('Thread context (prior messages, oldest first):');
    parts.push(emailData.threadContext);
    parts.push('');
    parts.push('Latest message in thread:');
  } else if (emailData.isThread) {
    parts.push('(This is part of an ongoing thread)');
  }

  parts.push('');
  parts.push('Body:');
  parts.push(emailData.body);
  parts.push('');
  parts.push('Return ONLY a JSON object:');
  parts.push('{');
  parts.push('  "category": "action" | "fyi" | "skip",');
  parts.push('  "summary": "1-2 sentence summary",');
  parts.push('  "actionItems": ["specific action needed"] or [],');
  parts.push('  "proposedReply": "draft reply text" or null,');
  parts.push('  "skipReason": "newsletter" | "promo" | "notification" | "system" | "error" or null,');
  parts.push('  "fyiCategory": "finance" | "team" | "system" | "other",');
  parts.push('  "owner": "you" | "someone_else" | "unclear",');
  parts.push('  "waitingOn": "who owes the work" or null');
  parts.push('}');
  parts.push('');
  parts.push('Rules:');
  parts.push('- category is REQUIRED. Default to "fyi" if unsure between fyi and action.');
  parts.push('- proposedReply ONLY for "action" emails. Must match the language of the original.');
  parts.push('- actionItems must be empty [] for "fyi" and "skip" emails.');
  parts.push('- fyiCategory is REQUIRED for all emails (used for grouping in the briefing).');
  parts.push('- owner is REQUIRED. Use "someone_else" whenever the user already asked another person');
  parts.push('  for this, or another person owes the next step. waitingOn must name them.');
  parts.push('- Return only the JSON — no markdown fences, no explanation.');

  return parts.join('\n');
}

/**
 * Verification pass — reviews the assembled briefing for quality issues.
 * Catches: raw JSON in summaries, nonsensical text, broken formatting.
 * Fixes issues in-place and returns cleaned data.
 *
 * @param {string} overallSummary
 * @param {EmailAnalysis[]} analyses
 * @returns {{ overallSummary: string, analyses: EmailAnalysis[] }}
 */
function verifyBriefing(overallSummary, analyses) {
  // Build a compact representation of what we're about to send
  var issues = [];

  // Check overall summary for problems
  if (overallSummary.indexOf('{') !== -1 && overallSummary.indexOf('"category"') !== -1) {
    issues.push('Overall summary contains raw JSON');
  }

  // Check each analysis for problems
  analyses.forEach(function(a, i) {
    // Raw JSON leaked into summary
    if (a.summary && a.summary.indexOf('"category"') !== -1) {
      issues.push('Email ' + i + ' (' + a.email.subject + '): summary contains raw JSON');
      a.summary = 'Analysis produced malformed output';
      a.category = 'skip';
      a.skipReason = 'error';
      a.error = true;
    }
    // Markdown fences in summary
    if (a.summary && a.summary.indexOf('```') !== -1) {
      issues.push('Email ' + i + ' (' + a.email.subject + '): summary contains code fences');
      a.summary = a.summary.replace(/```[a-z]*\s*/g, '').replace(/```/g, '').trim();
    }
    // Proposed reply contains JSON
    if (a.proposedReply && a.proposedReply.indexOf('"category"') !== -1) {
      a.proposedReply = null;
    }
    // Ownership coherence: a delegated item has no reply for the user to send,
    // and a self-owned item should not claim we're waiting on anyone.
    if (a.owner === 'someone_else') {
      a.proposedReply = null;
    } else {
      a.waitingOn = null;
    }
  });

  if (issues.length > 0) {
    Logger.log('Verification found ' + issues.length + ' issue(s): ' + issues.join('; '));
  } else {
    Logger.log('Verification passed — no issues found');
  }

  // If overall summary has issues, try to regenerate it from the analysis data
  if (overallSummary.indexOf('"category"') !== -1 || overallSummary.length < 10) {
    var actionCount = analyses.filter(function(a) { return a.category === 'action'; }).length;
    var fyiCount = analyses.filter(function(a) { return a.category === 'fyi'; }).length;
    var skipCount = analyses.filter(function(a) { return a.category === 'skip'; }).length;
    overallSummary = actionCount + ' need your attention, ' + fyiCount + ' worth reading, ' + skipCount + ' skipped.';
  }

  return { overallSummary: overallSummary, analyses: analyses };
}
