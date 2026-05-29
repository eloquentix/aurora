/**
 * main.gs — Entry points
 *
 * Run these functions from the Apps Script editor or via clasp:
 *
 *   runBriefing()    — fetch, analyze, and send the briefing email
 *   testBriefing()   — last 4 hours, max 5 emails, sends a real email so you can preview it
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
    throw new Error('Aurora config errors:\n' + errors.join('\n'));
  }

  var cfg = getConfig();
  Logger.log('Aurora starting. Provider: ' + cfg.AI_PROVIDER + ', scanning last ' + cfg.HOURS_BACK + 'h');

  // 2. Fetch recent emails and calendar events
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var emails = fetchRecentEmails(cfg.HOURS_BACK, cfg.MAX_EMAILS, cfg.GMAIL_SEARCH);
  Logger.log('Fetched ' + emails.length + ' emails');

  // Filter out Aurora's own briefing emails (self-flagging prevention)
  var personaLower = cfg.PERSONA_NAME.toLowerCase();
  emails = emails.filter(function(e) {
    var isSelfEmail = e.senderEmail === me && e.subject.toLowerCase().indexOf(personaLower) !== -1;
    if (isSelfEmail) Logger.log('Filtered self-email: ' + e.subject);
    return !isSelfEmail;
  });
  Logger.log('After self-filter: ' + emails.length + ' emails');

  var calendarEvents = fetchTodayEvents();
  Logger.log('Calendar: ' + calendarEvents.length + ' events today');

  if (emails.length === 0) {
    var otherCount = countNonPrimaryEmails(cfg.HOURS_BACK);
    var emptyMsg = otherCount > 0
      ? 'Nothing important. ' + otherCount + ' other email' + (otherCount !== 1 ? 's' : '') + ' arrived (promotions, notifications) — nothing that needs you.'
      : 'Inbox is clear. Nothing new in the last ' + cfg.HOURS_BACK + ' hours.';
    sendBriefingEmail(emptyMsg, [], calendarEvents, cfg);
    Logger.log('Empty inbox briefing sent. (' + otherCount + ' non-primary skipped)');
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

    // Delay between calls to respect provider rate limits.
    // Gemini free tier: 10 req/min — we use 6.5s to stay safely under.
    if (i < allEmails.length - 1) {
      Utilities.sleep(getCallDelay());
    }
  }

  // 5. Generate overall summary (with calendar context)
  Logger.log('Generating overall summary...');
  var overallSummary = generateOverallSummary(analyses, calendarEvents);

  // 6. Verification pass — AI reviews the assembled output for quality
  Logger.log('Running verification pass...');
  var verified = verifyBriefing(overallSummary, analyses);
  overallSummary = verified.overallSummary;
  analyses = verified.analyses;

  // 7. Label skipped emails in Gmail
  labelSkippedEmails(analyses);

  // 8. Build and send the briefing email
  sendBriefingEmail(overallSummary, analyses, calendarEvents, cfg);

  Logger.log('Briefing sent. ' + analyses.length + ' emails processed.');
}

/**
 * Test mode: runs the pipeline on the last 4 hours (max 5 emails) and
 * sends a real briefing email so you can see exactly what it looks like.
 * Check your inbox and the Execution Log after running.
 */
function testBriefing() {
  var errors = validateConfig();
  if (errors.length > 0) {
    throw new Error('Aurora config errors:\n' + errors.join('\n'));
  }

  var cfg = getConfig();
  Logger.log('=== TEST MODE: scanning last 4 hours, max 5 emails ===');

  var testHours = 4;
  var emails = fetchRecentEmails(testHours, 5, cfg.GMAIL_SEARCH);
  Logger.log('Found ' + emails.length + ' emails');

  var calendarEvents = fetchTodayEvents();
  Logger.log('Calendar: ' + calendarEvents.length + ' events today');

  if (emails.length === 0) {
    var otherCount = countNonPrimaryEmails(testHours);
    var emptyMsg = otherCount > 0
      ? 'Nothing important. ' + otherCount + ' other email' + (otherCount !== 1 ? 's' : '') + ' arrived (promotions, notifications) — nothing that needs you.'
      : 'Inbox is clear. Nothing new in the last ' + testHours + ' hours.';
    sendBriefingEmail(emptyMsg, [], calendarEvents, cfg);
    Logger.log('=== TEST COMPLETE (empty Primary, ' + otherCount + ' non-primary) — check your inbox! ===');
    return;
  }

  var analyses = [];
  for (var i = 0; i < emails.length; i++) {
    Logger.log('Analyzing: ' + emails[i].subject);
    analyses.push(analyzeEmail(emails[i]));
    if (i < emails.length - 1) Utilities.sleep(getCallDelay());
  }

  var summary = generateOverallSummary(analyses, calendarEvents);
  Logger.log('Overall summary: ' + summary);

  var verified = verifyBriefing(summary, analyses);
  summary = verified.overallSummary;
  analyses = verified.analyses;

  labelSkippedEmails(analyses);
  sendBriefingEmail(summary, analyses, calendarEvents, cfg);
  Logger.log('=== TEST COMPLETE — check your inbox! ===');
}

/**
 * Builds and sends the briefing email to the user's own address.
 *
 * @param {string}          overallSummary
 * @param {EmailAnalysis[]} analyses
 * @param {Object}          cfg
 */
function sendBriefingEmail(overallSummary, analyses, calendarEvents, cfg) {
  var me = Session.getActiveUser().getEmail();
  var subject = cfg.PERSONA_NAME + ' — ' + formatToday();

  var htmlBody = buildBriefingHTML(overallSummary, analyses, calendarEvents, cfg);
  var plainBody = buildBriefingPlainText(overallSummary, analyses, calendarEvents);

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
