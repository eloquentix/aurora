/**
 * agent.gs — The agent orchestrator
 *
 * This is the heart of the "agent" pattern. An agent is a system that:
 *   1. Has a persona and goal (SYSTEM_PROMPT)
 *   2. Receives input (email data)
 *   3. Reasons about it (calls the AI)
 *   4. Produces structured output (JSON analysis)
 *   5. Can be composed — multiple calls build toward a bigger picture
 *
 * This file does two things:
 *   - analyzeEmail()          — per-email: summary, actions, proposed reply
 *   - generateOverallSummary() — one call across all analyses to synthesize the day
 *
 * Future extension point (memory/learning):
 *   analyzeEmail() is where you'd inject sender context before calling the AI.
 *   e.g. look up emailData.senderEmail in Firebase/PropertiesService and prepend:
 *   "Context: You've emailed this person 8 times. Last topic: project kickoff."
 */

/**
 * The agent's persona and output rules.
 * This is the system prompt — it shapes every AI call in the session.
 * Keep it tight: specific rules outperform vague instructions.
 */
var SYSTEM_PROMPT = [
  'You are Secretary, an AI agent that reads emails and produces concise, structured briefings.',
  '',
  'Your job is to help a busy professional understand what matters in their inbox and take action fast.',
  '',
  'Guidelines:',
  '- Be direct and specific. No filler words, no vague summaries.',
  '- Action items must be concrete: who needs to do what, by when if known.',
  '- Proposed replies should match the tone of the original email (formal stays formal, casual stays casual).',
  '- Skip newsletters, automated notifications, receipts, and system emails — flag them as "no action needed".',
  '- Never fabricate information. If you cannot determine something from the email, say so.',
].join('\n');

/**
 * Analyzes a single email and returns structured output.
 *
 * @param {EmailData} emailData
 * @returns {EmailAnalysis}
 *
 * @typedef {Object} EmailAnalysis
 * @property {EmailData} email          The original email data
 * @property {string}    summary        1-2 sentence plain-language summary
 * @property {string[]}  actionItems    Specific actions required (empty if none)
 * @property {string|null} proposedReply Draft reply text (null if no reply warranted)
 * @property {boolean}   error          true if the AI call failed
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
      summary: 'Could not analyze this email: ' + e.message,
      actionItems: [],
      proposedReply: null,
      error: true,
    };
  }

  var parsed = safeJsonParse(responseText);

  // If JSON parsing fails, build a graceful fallback
  if (!parsed) {
    Logger.log('JSON parse failed for response: ' + truncate(responseText, 200));
    return {
      email: emailData,
      summary: truncate(responseText, 300),
      actionItems: [],
      proposedReply: null,
      error: false,
    };
  }

  return {
    email: emailData,
    summary: parsed.summary || '',
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    proposedReply: parsed.proposedReply || null,
    error: false,
  };
}

/**
 * Generates a 2-3 sentence executive summary across all email analyses.
 * This is the second AI call — it synthesizes the individual analyses into
 * a single "state of the inbox" overview at the top of the briefing.
 *
 * @param {EmailAnalysis[]} analyses
 * @returns {string}
 */
function generateOverallSummary(analyses) {
  if (!analyses || analyses.length === 0) {
    return 'Inbox is clear. Nothing new in the last ' + getConfig().HOURS_BACK + ' hours.';
  }

  // Build a compact input: just summaries + action items, no full bodies
  var lines = analyses.map(function(a, i) {
    var actions = a.actionItems.length > 0
      ? 'Actions: ' + a.actionItems.join(' | ')
      : 'No action needed.';
    return (i + 1) + '. From ' + a.email.sender + ' — "' + a.email.subject + '"\n   ' +
      a.summary + '\n   ' + actions;
  });

  var prompt = [
    'Here are summaries of ' + analyses.length + ' emails from this morning\'s inbox:',
    '',
    lines.join('\n\n'),
    '',
    'Write a 2-3 sentence executive overview of the inbox. What is most urgent? What is the overall theme? ',
    'Be direct and specific. Do not list every email — synthesize.',
  ].join('\n');

  try {
    return callAI(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 256,
      temperature: 0.4,
    });
  } catch (e) {
    Logger.log('Overall summary failed: ' + e.message);
    return analyses.length + ' emails processed. See details below.';
  }
}

/**
 * Builds the per-email analysis prompt.
 * Asks the AI to return a specific JSON structure.
 *
 * @param {EmailData} emailData
 * @returns {string}
 */
function buildAnalysisPrompt(emailData) {
  return [
    'Analyze the following email and return a JSON object.',
    '',
    'Email:',
    'From: ' + emailData.sender + ' <' + emailData.senderEmail + '>',
    'Subject: ' + emailData.subject,
    'Date: ' + emailData.date,
    'Body:',
    emailData.body,
    '',
    'Return ONLY a JSON object with these fields:',
    '{',
    '  "summary": "1-2 sentence plain-language summary of what this email is about",',
    '  "actionItems": ["specific action 1", "specific action 2"],',
    '  "proposedReply": "draft reply text if a reply is warranted, or null if not"',
    '}',
    '',
    'Rules:',
    '- actionItems must be specific (e.g. "Reply to confirm Thursday meeting" not "Reply to email")',
    '- actionItems should be empty [] for newsletters, receipts, and automated notifications',
    '- proposedReply should be null unless a human reply is clearly expected or useful',
    '- proposedReply text should be ready to send, not a template with placeholders',
    '- Return only the JSON — no markdown fences, no explanation',
  ].join('\n');
}
