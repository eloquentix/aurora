/**
 * main.gs — Entry points
 *
 * Run these functions from the Apps Script editor or via clasp:
 *
 *   runBriefing()    — fetch, analyze, and send the briefing email
 *   testBriefing()   — same but last 4 hours, logs output instead of sending
 *   installTrigger() — set up daily 7 AM trigger
 *   removeTrigger()  — remove all project triggers
 */

/**
 * Main entry point. Runs the full briefing pipeline and sends the email.
 * Called by the daily time-based trigger (or manually).
 */
function runBriefing() {
  // 1. Validate config — fail fast with a clear error
  var errors = validateConfig();
  if (errors.length > 0) {
    throw new Error('Secretary config errors:\n' + errors.join('\n'));
  }

  var cfg = getConfig();
  Logger.log('Secretary starting. Provider: ' + cfg.AI_PROVIDER + ', scanning last ' + cfg.HOURS_BACK + 'h');

  // 2. Fetch recent emails
  var emails = fetchRecentEmails(cfg.HOURS_BACK, cfg.MAX_EMAILS);
  Logger.log('Fetched ' + emails.length + ' emails');

  if (emails.length === 0) {
    sendBriefingEmail(
      'Inbox is clear. Nothing new in the last ' + cfg.HOURS_BACK + ' hours.',
      [],
      cfg
    );
    Logger.log('Empty inbox briefing sent.');
    return;
  }

  // 3. Classify into priority and other
  var classified = classifyEmails(emails, cfg.PRIORITY_CONTACTS);
  Logger.log('Priority: ' + classified.priority.length + ', Other: ' + classified.other.length);

  // 4. Analyze each email (priority first, with a brief pause between calls)
  var allEmails = classified.priority.concat(classified.other);
  var analyses = [];

  for (var i = 0; i < allEmails.length; i++) {
    var analysis = analyzeEmail(allEmails[i]);
    analyses.push(analysis);
    Logger.log('Analyzed (' + (i + 1) + '/' + allEmails.length + '): ' + allEmails[i].subject);

    // Small delay between calls to avoid rate limiting
    if (i < allEmails.length - 1) {
      Utilities.sleep(300);
    }
  }

  // 5. Generate overall summary
  Logger.log('Generating overall summary...');
  var overallSummary = generateOverallSummary(analyses);

  // 6. Build and send the briefing email
  sendBriefingEmail(overallSummary, analyses, cfg);

  Logger.log('Briefing sent. ' + analyses.length + ' emails processed.');
}

/**
 * Test mode: runs the pipeline for the last 4 hours, logs HTML output
 * to the Execution Log instead of sending an email. Safe to run any time.
 */
function testBriefing() {
  var errors = validateConfig();
  if (errors.length > 0) {
    throw new Error('Secretary config errors:\n' + errors.join('\n'));
  }

  var cfg = getConfig();
  Logger.log('=== TEST MODE: scanning last 4 hours ===');

  var emails = fetchRecentEmails(4, 10); // smaller cap for testing
  Logger.log('Found ' + emails.length + ' emails');

  var analyses = [];
  for (var i = 0; i < emails.length; i++) {
    Logger.log('Analyzing: ' + emails[i].subject);
    analyses.push(analyzeEmail(emails[i]));
    if (i < emails.length - 1) Utilities.sleep(300);
  }

  var summary = generateOverallSummary(analyses);
  Logger.log('\n--- OVERALL SUMMARY ---\n' + summary);

  analyses.forEach(function(a) {
    Logger.log('\n--- ' + a.email.subject + ' ---');
    Logger.log('Summary: ' + a.summary);
    Logger.log('Actions: ' + JSON.stringify(a.actionItems));
    Logger.log('Proposed reply: ' + (a.proposedReply || 'none'));
  });

  Logger.log('\n=== TEST COMPLETE ===');
}

/**
 * Builds and sends the briefing email to the user's own address.
 *
 * @param {string}          overallSummary
 * @param {EmailAnalysis[]} analyses
 * @param {Object}          cfg
 */
function sendBriefingEmail(overallSummary, analyses, cfg) {
  var me = Session.getActiveUser().getEmail();
  var subject = cfg.PERSONA_NAME + ' — ' + formatToday();

  var htmlBody = buildBriefingHTML(overallSummary, analyses, cfg);
  var plainBody = buildBriefingPlainText(overallSummary, analyses);

  GmailApp.sendEmail(me, subject, plainBody, {
    htmlBody: htmlBody,
    name: cfg.PERSONA_NAME,
  });
}

// ---------------------------------------------------------------------------
// Trigger management
// ---------------------------------------------------------------------------

/**
 * Installs a daily time-based trigger at BRIEFING_HOUR.
 * Run this once after deploying. Safe to run again — removes old triggers first.
 */
function installTrigger() {
  removeTrigger(); // clean up any existing triggers

  var cfg = getConfig();
  ScriptApp.newTrigger('runBriefing')
    .timeBased()
    .everyDays(1)
    .atHour(cfg.BRIEFING_HOUR)
    .create();

  Logger.log('Trigger installed: runBriefing will run daily at ' + cfg.BRIEFING_HOUR + ':00.');
}

/**
 * Removes all time-based triggers for this project.
 */
function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runBriefing') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  if (removed > 0) Logger.log('Removed ' + removed + ' existing trigger(s).');
}
