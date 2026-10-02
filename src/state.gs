/**
 * state.gs — Run state in Script Properties
 *
 * Aurora used to scan a fixed HOURS_BACK window, so a skipped or failed run
 * silently dropped those emails on the floor. Instead we remember when the
 * last run finished successfully and scan from there.
 *
 * One property: LAST_RUN_EPOCH (seconds). Clear it in Project Settings to
 * fall back to the HOURS_BACK window on the next run.
 */

var LAST_RUN_PROP = 'LAST_RUN_EPOCH';

/**
 * Epoch seconds of the last successful run, or null if never recorded.
 * @returns {number|null}
 */
function getLastRunEpoch() {
  var raw = PropertiesService.getScriptProperties().getProperty(LAST_RUN_PROP);
  if (!raw) return null;
  var n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return null;
  // A stamp in the future means a clock or timezone mishap — ignore it rather
  // than scanning nothing at all.
  if (n > nowEpoch() + 3600) {
    Logger.log('LAST_RUN_EPOCH is in the future (' + n + ') — ignoring it.');
    return null;
  }
  return n;
}

/**
 * Records a successful run. Pass the epoch captured at the START of the run,
 * not "now": anything that arrived while we were analyzing must be picked up
 * by the next run, not skipped.
 *
 * @param {number} epochSeconds
 */
function setLastRunEpoch(epochSeconds) {
  PropertiesService.getScriptProperties()
    .setProperty(LAST_RUN_PROP, String(epochSeconds));
  Logger.log('Recorded run watermark: ' + epochSeconds +
             ' (' + formatDate(new Date(epochSeconds * 1000)) + ')');
}

/**
 * Current time in epoch seconds.
 * @returns {number}
 */
function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Works out the window to scan.
 *
 * Normal case: from the last successful run to now, so nothing is missed when
 * a run fails or a trigger is skipped. First run (or a cleared watermark)
 * falls back to HOURS_BACK. Either way the window is capped at
 * MAX_LOOKBACK_HOURS so a long outage can't pull in hundreds of emails.
 *
 * @param {Object} cfg       Result of getConfig()
 * @param {number} runEpoch  Epoch seconds captured at the start of this run
 * @returns {ScanWindow}
 *
 * @typedef {Object} ScanWindow
 * @property {number}  sinceEpoch  Scan emails newer than this
 * @property {number}  hours       Window length in hours (for logs/messages)
 * @property {string}  label       Human description, e.g. "since yesterday 07:02"
 * @property {boolean} fromLastRun true if anchored on the last successful run
 * @property {boolean} capped      true if MAX_LOOKBACK_HOURS clipped it
 */
function computeScanWindow(cfg, runEpoch) {
  var lastRun = getLastRunEpoch();
  var floor = runEpoch - cfg.MAX_LOOKBACK_HOURS * 3600;

  var since = lastRun !== null ? lastRun : runEpoch - cfg.HOURS_BACK * 3600;
  var capped = since < floor;
  if (capped) since = floor;

  var hours = Math.max(1, Math.round((runEpoch - since) / 3600));

  return {
    sinceEpoch: since,
    hours: hours,
    label: lastRun !== null && !capped
      ? 'since the last briefing (' + formatDate(new Date(since * 1000)) + ')'
      : 'the last ' + hours + ' hours',
    fromLastRun: lastRun !== null && !capped,
    capped: capped,
  };
}
