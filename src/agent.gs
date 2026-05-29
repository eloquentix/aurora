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
  'REPLY RULES:',
  '- Only propose a reply for "action" emails where a human reply is clearly expected.',
  '- Match the LANGUAGE of the original email. Romanian stays Romanian. English stays English. Never translate.',
  '- Match the tone and formality of the sender. Casual → casual. Formal → formal.',
  '- For internal colleagues and people you clearly know well: be brief and casual. "Sure, sounds good." not "I acknowledge receipt of your message."',
  '- Write like a busy, competent professional — not like an AI. No "I hope this email finds you well."',
  '- Be concise. 1-3 sentences max. Get to the point.',
  '- If the email is part of a thread, acknowledge context from earlier messages.',
  '- proposedReply must be null for "fyi" and "skip" emails.',
  '',
  'CONTEXT AWARENESS:',
  '- The "To:" and "CC:" fields tell you who the email is addressed to.',
  '- If the user is in CC (not in To:), they probably don\'t need to reply — lean toward "fyi".',
  '- If the email was forwarded BY the user to themselves, summarize what the forwarded content is about.',
  '  Do NOT say "User forwarded..." — they know they did it. Say what the document/notification IS.',
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
 * @property {boolean}      error          true if AI call failed
 */
function analyzeEmail(emailData) {
  var prompt = buildAnalysisPrompt(emailData);

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
      error: true,
    };
  }

  var category = parsed.category || 'fyi';
  if (['action', 'fyi', 'skip'].indexOf(category) === -1) category = 'fyi';

  var fyiCategory = parsed.fyiCategory || 'other';
  if (['finance', 'team', 'system', 'other'].indexOf(fyiCategory) === -1) fyiCategory = 'other';

  return {
    email: emailData,
    category: category,
    summary: parsed.summary || '',
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    proposedReply: category === 'action' ? (parsed.proposedReply || null) : null,
    skipReason: parsed.skipReason || null,
    fyiCategory: fyiCategory,
    error: false,
  };
}

/**
 * Generates the overall briefing summary. Includes calendar and FYI context.
 *
 * @param {EmailAnalysis[]} analyses
 * @param {Object[]} [calendarEvents]  Today's calendar events (optional)
 * @returns {string}
 */
function generateOverallSummary(analyses, calendarEvents) {
  if (!analyses || analyses.length === 0) {
    return 'Inbox is clear. Nothing new.';
  }

  var actionCount = 0, fyiCount = 0, skipCount = 0;
  analyses.forEach(function(a) {
    if (a.category === 'action') actionCount++;
    else if (a.category === 'fyi') fyiCount++;
    else skipCount++;
  });

  // Build rich context for the AI
  var actionSummaries = analyses
    .filter(function(a) { return a.category === 'action'; })
    .map(function(a) { return '- ' + a.email.sender + ': ' + a.summary; });

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

  var prompt = [
    'Email stats: ' + actionCount + ' need attention, ' + fyiCount + ' FYI, ' + skipCount + ' skipped.',
    '',
    actionCount > 0 ? 'Emails needing action:\n' + actionSummaries.join('\n') : 'No emails need action.',
    '',
    fyiHighlights.length > 0 ? 'FYI highlights:\n' + fyiHighlights.join('\n') : '',
    calendarContext,
    '',
    'Write a 2-4 sentence executive summary for a CEO\'s morning briefing.',
    'DO NOT just repeat the counts — I can see those myself.',
    'Instead: What are the 1-3 most important things I need to know right now?',
    'Mention specific money amounts if payments arrived or are due.',
    'Mention the first meeting of the day if there is one.',
    'Mention any deadlines or time-sensitive items.',
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
    'self':    'User sent/forwarded this to themselves',
    'unknown': 'Unknown (possibly BCC or list)',
  };
  return descriptions[role] || descriptions['unknown'];
}

/**
 * Builds the per-email analysis prompt with full context.
 */
function buildAnalysisPrompt(emailData) {
  var parts = [
    'Analyze this email and return a JSON object.',
    '',
    'Email:',
    'From: ' + emailData.sender + ' <' + emailData.senderEmail + '>',
    'Subject: ' + emailData.subject,
    'Date: ' + emailData.date,
    'User\'s role: ' + describeRecipientRole(emailData.recipientRole),
  ];

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
  parts.push('  "fyiCategory": "finance" | "team" | "system" | "other"');
  parts.push('}');
  parts.push('');
  parts.push('Rules:');
  parts.push('- category is REQUIRED. Default to "fyi" if unsure between fyi and action.');
  parts.push('- proposedReply ONLY for "action" emails. Must match the language of the original.');
  parts.push('- actionItems must be empty [] for "fyi" and "skip" emails.');
  parts.push('- fyiCategory is REQUIRED for all emails (used for grouping in the briefing).');
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
