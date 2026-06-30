/**
 * augur.gs — Augur forecaster status block
 *
 * Augur (the Eloquentix intraday forecaster) exposes a single digested health
 * reading at a private, token-guarded endpoint. We fetch it once per briefing
 * and render a compact section into the morning email — so Radu sees, every
 * day, whether the live forecaster and its Predico league run are healthy.
 *
 * The endpoint does all the computation; this file only renders. If the URL
 * isn't configured or the fetch fails, the section silently omits itself —
 * Augur health must never break the briefing.
 *
 * Config: set AUGUR_STATUS_URL in Script Properties to the full token URL,
 *   e.g. https://augur.eloquentix.com/x/<token>/status.json
 */

// Status-only colors (the shared COLORS palette has no green).
var AUGUR_OK = '#2e7d32';
var AUGUR_BAD = '#b3261e';

/**
 * Fetches the Augur status digest. Returns the parsed object, or null on any
 * failure (missing URL, network error, non-200, bad JSON).
 */
function fetchAugurStatus(url) {
  if (!url) return null;
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Augur status: HTTP ' + resp.getResponseCode());
      return null;
    }
    return JSON.parse(resp.getContentText());
  } catch (e) {
    Logger.log('Augur status fetch failed: ' + e);
    return null;
  }
}

/**
 * Builds the Augur section HTML. Returns '' if disabled or unreachable.
 * @param {Object} cfg
 */
function buildAugurSection(cfg) {
  if (!cfg.AUGUR_STATUS_URL) return '';
  var s = fetchAugurStatus(cfg.AUGUR_STATUS_URL);
  if (!s) {
    // Reaching the endpoint is itself a health signal — a silent miss could
    // hide a dead box. Show a quiet one-liner rather than nothing.
    return [
      buildDivider(),
      '<div style="padding:0 4px">',
      buildSectionHeadline('Augur — Forecaster'),
      '<div style="color:' + AUGUR_BAD + ';font-size:13px;margin-top:8px">',
      'Status endpoint unreachable — check the box.',
      '</div></div>',
    ].join('');
  }

  var fc = s.forecast || {};
  var host = s.host || {};
  var env = s.env ? String(s.env).toUpperCase() : '';

  // Health pill
  var ok = !!s.ok;
  var pillColor = ok ? AUGUR_OK : AUGUR_BAD;
  var pillText = ok ? 'HEALTHY' : ((s.alerts || []).length + ' ALERT' + ((s.alerts || []).length !== 1 ? 'S' : ''));
  var pill = '<span style="display:inline-block;background:' + pillColor + ';color:#fff;' +
    'font-size:11px;font-weight:700;letter-spacing:0.5px;padding:2px 8px;border-radius:3px">' +
    escapeHtml(pillText) + '</span>';
  var envTag = env
    ? '<span style="color:' + COLORS.textMuted + ';font-size:11px;margin-left:8px">' + escapeHtml(env) + '</span>'
    : '';

  // Alerts (if any)
  var alertsHtml = '';
  if (!ok && (s.alerts || []).length) {
    alertsHtml = '<div style="color:' + AUGUR_BAD + ';font-size:13px;margin-top:8px;line-height:1.6">' +
      (s.alerts).map(function(a) { return '&#9888; ' + escapeHtml(a); }).join('<br>') +
      '</div>';
  }

  // Forecast line
  var fcParts = [];
  if (fc.available) {
    fcParts.push((fc.resources_active || 0) + '/' + (fc.resources_total || 0) + ' resources active');
    fcParts.push((fc.beating || 0) + ' beating · ' + (fc.behind || 0) + ' behind · ' +
      (fc.pending || 0) + ' pending');
    if (fc.unscored_warn) fcParts.push(fc.unscored_warn + ' unscored ⚠');
    if (fc.last_submission) fcParts.push('last submit ' + escapeHtml(fc.last_submission));
  } else {
    fcParts.push('scorecard unavailable');
  }
  var forecastHtml = '<div style="color:' + COLORS.text + ';font-size:13px;margin-top:8px;line-height:1.6">' +
    fcParts.join('<br>') + '</div>';

  // Services line — show all-good compactly, or list the offenders
  var services = s.services || {};
  var bad = [];
  for (var k in services) {
    if (services[k] !== 'active' && services[k] !== 'unknown') bad.push(k + ' (' + services[k] + ')');
  }
  var svcHtml;
  if (bad.length === 0) {
    svcHtml = '<span style="color:' + AUGUR_OK + '">all services active</span>';
  } else {
    svcHtml = '<span style="color:' + AUGUR_BAD + '">' + escapeHtml(bad.join(', ')) + '</span>';
  }

  // Host line
  var hostBits = [];
  if (host.disk_used_pct != null) hostBits.push('disk ' + host.disk_used_pct + '%');
  if (host.mem_used_pct != null) hostBits.push('mem ' + host.mem_used_pct + '%');
  var infraHtml = '<div style="color:' + COLORS.textMuted + ';font-size:12px;margin-top:6px">' +
    svcHtml +
    (hostBits.length ? ' &nbsp;&middot;&nbsp; ' + escapeHtml(hostBits.join(' · ')) : '') +
    '</div>';

  return [
    buildDivider(),
    '<div style="padding:0 4px">',
    buildSectionHeadline('Augur — Forecaster'),
    '<div style="margin-top:8px">' + pill + envTag + '</div>',
    alertsHtml,
    forecastHtml,
    infraHtml,
    '</div>',
  ].join('');
}
