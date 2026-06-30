/**
 * briefing.gs — HTML email builder (v2 — newspaper design)
 *
 * Produces a warm, newspaper-style HTML email with:
 *   - Header with date and email count
 *   - Today's calendar schedule
 *   - AI-generated overview
 *   - Three sections: Action / FYI / Skip (count only)
 *   - Per-email cards with proposed replies and mailto buttons
 *
 * All CSS is inline — email clients strip <style> blocks.
 */

// Newspaper color palette — warm cream and brown
var COLORS = {
  bg:            '#faf7f2',
  card:          '#ffffff',
  accent:        '#8b4513',
  accentLight:   '#a0522d',
  headline:      '#1a1a1a',
  text:          '#333333',
  textMuted:     '#888888',
  border:        '#e0d5c5',
  actionBg:      '#fff9f0',
  actionBorder:  '#d4a574',
  fyiBg:         '#ffffff',
  fyiBorder:     '#e0d5c5',
  replyBg:       '#f5f0e8',
  errorBg:       '#fce8e6',
  calendarBg:    '#f5f0e8',
  skipText:      '#999999',
};

// Font stacks
var FONT_HEADLINE = "Georgia, 'Times New Roman', serif";
var FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Builds the complete HTML email for the briefing.
 *
 * @param {string}           overallSummary
 * @param {EmailAnalysis[]}  analyses
 * @param {CalendarEvent[]}  calendarEvents
 * @param {Object}           cfg  Result of getConfig()
 * @returns {string}  HTML string
 */
function buildBriefingHTML(overallSummary, analyses, calendarEvents, cfg) {
  // Split analyses into buckets
  var actionEmails = [];
  var fyiEmails = [];
  var skipCount = 0;
  var skipReasons = {};

  analyses.forEach(function(a) {
    if (a.category === 'action') {
      actionEmails.push(a);
    } else if (a.category === 'skip') {
      skipCount++;
      var reason = a.skipReason || 'other';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    } else {
      fyiEmails.push(a);
    }
  });

  var html = [
    buildHeader(cfg, analyses.length),
    buildDivider(),
    (calendarEvents && calendarEvents.length > 0) ? buildCalendarSection(calendarEvents) + buildDivider() : '',
    buildSummaryBox(overallSummary),
    buildAugurSection(cfg),
    buildDivider(),
    actionEmails.length > 0 ? buildActionSection(actionEmails) : '',
    fyiEmails.length > 0 ? buildFyiSection(fyiEmails) : '',
    skipCount > 0 ? buildSkipLine(skipCount, skipReasons) : '',
    buildFooter(cfg),
  ].join('');

  return wrapInBody(html);
}

/**
 * Wraps content in a full HTML document with outer table layout.
 */
function wrapInBody(content) {
  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:' + COLORS.bg + ';font-family:' + FONT_BODY + '">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + COLORS.bg + '">',
    '<tr><td align="center" style="padding:20px 10px">',
    '<table width="800" cellpadding="0" cellspacing="0" border="0" style="max-width:800px;width:100%">',
    '<tr><td>',
    content,
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * Header: "AURORA · Wednesday, May 28"
 */
function buildHeader(cfg, emailCount) {
  return [
    '<div style="padding:28px 0 8px;text-align:center">',
    '<div style="font-family:' + FONT_HEADLINE + ';font-size:28px;font-weight:700;',
    'letter-spacing:3px;color:' + COLORS.headline + ';text-transform:uppercase">',
    escapeHtml(cfg.PERSONA_NAME),
    '</div>',
    '<div style="color:' + COLORS.textMuted + ';font-size:13px;margin-top:4px;letter-spacing:0.5px">',
    formatToday() + ' &nbsp;&middot;&nbsp; ' + emailCount + ' email' + (emailCount !== 1 ? 's' : ''),
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Thin horizontal rule — newspaper divider
 */
function buildDivider() {
  return '<hr style="border:none;border-top:1px solid ' + COLORS.border + ';margin:16px 0">';
}

/**
 * Today's calendar events
 */
function buildCalendarSection(events) {
  var rows = events.map(function(e) {
    var timeStr = e.isAllDay ? 'All day' : e.startTime;
    var meetHtml = e.meetLink
      ? ' &nbsp;<a href="' + e.meetLink + '" style="color:' + COLORS.accent + ';text-decoration:none;font-size:12px">[Meet]</a>'
      : '';
    return [
      '<tr>',
      '<td style="color:' + COLORS.textMuted + ';font-size:13px;padding:3px 12px 3px 0;',
      'white-space:nowrap;vertical-align:top">' + escapeHtml(timeStr) + '</td>',
      '<td style="color:' + COLORS.text + ';font-size:13px;padding:3px 0;vertical-align:top">',
      escapeHtml(e.title) + meetHtml,
      '</td>',
      '</tr>',
    ].join('');
  }).join('');

  return [
    '<div style="padding:0 4px">',
    buildSectionHeadline("Today's Schedule"),
    '<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:8px">',
    rows,
    '</table>',
    '</div>',
  ].join('');
}

/**
 * Summary box: the overall AI-generated summary
 */
function buildSummaryBox(summary) {
  return [
    '<div style="padding:0 4px">',
    buildSectionHeadline('Overview'),
    '<div style="color:' + COLORS.text + ';font-size:14px;line-height:1.7;margin-top:8px">',
    escapeHtml(summary),
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Section headline in small caps — newspaper style
 */
function buildSectionHeadline(text) {
  return [
    '<div style="font-family:' + FONT_HEADLINE + ';font-size:11px;font-weight:700;',
    'text-transform:uppercase;letter-spacing:1.5px;color:' + COLORS.accent + '">',
    text,
    '</div>',
  ].join('');
}

/**
 * Action section — emails needing attention, with full cards and proposed replies
 */
function buildActionSection(actionEmails) {
  var cards = actionEmails.map(function(a) {
    return buildActionCard(a);
  }).join('');

  return [
    buildDivider(),
    '<div style="border-left:3px solid ' + COLORS.actionBorder + ';padding-left:16px;margin-bottom:8px">',
    buildSectionHeadline('Requires Your Attention (' + actionEmails.length + ')'),
    '</div>',
    cards,
  ].join('');
}

/**
 * FYI section — grouped by fyiCategory with compact finance rows
 */
function buildFyiSection(fyiEmails) {
  // Group by fyiCategory
  var groups = { finance: [], team: [], system: [], other: [] };
  fyiEmails.forEach(function(a) {
    var cat = a.fyiCategory || 'other';
    if (!groups[cat]) cat = 'other';
    groups[cat].push(a);
  });

  var html = [
    buildDivider(),
    '<div style="padding-left:4px;margin-bottom:8px">',
    buildSectionHeadline('Worth Reading (' + fyiEmails.length + ')'),
    '</div>',
  ];

  // Finance group — compact one-liner format
  if (groups.finance.length > 0) {
    html.push(buildFyiGroupHeadline('Finance (' + groups.finance.length + ')'));
    groups.finance.forEach(function(a) {
      html.push(buildCompactFyiRow(a));
    });
  }

  // Team group — regular cards
  if (groups.team.length > 0) {
    html.push(buildFyiGroupHeadline('Team (' + groups.team.length + ')'));
    groups.team.forEach(function(a) {
      html.push(buildFyiCard(a));
    });
  }

  // System group — compact
  if (groups.system.length > 0) {
    html.push(buildFyiGroupHeadline('System (' + groups.system.length + ')'));
    groups.system.forEach(function(a) {
      html.push(buildCompactFyiRow(a));
    });
  }

  // Other — regular cards
  if (groups.other.length > 0) {
    if (groups.finance.length > 0 || groups.team.length > 0 || groups.system.length > 0) {
      html.push(buildFyiGroupHeadline('Other (' + groups.other.length + ')'));
    }
    groups.other.forEach(function(a) {
      html.push(buildFyiCard(a));
    });
  }

  return html.join('');
}

/**
 * Sub-group headline within the FYI section
 */
function buildFyiGroupHeadline(text) {
  return [
    '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;',
    'color:' + COLORS.textMuted + ';padding:10px 4px 4px;margin-top:4px">',
    text,
    '</div>',
  ].join('');
}

/**
 * Compact single-line FYI row (for finance/system groups)
 */
function buildCompactFyiRow(analysis) {
  var email = analysis.email;
  return [
    '<div style="padding:6px 10px;border-bottom:1px solid ' + COLORS.border + ';font-size:13px">',
    '<a href="' + email.gmailUrl + '" style="color:' + COLORS.text + ';text-decoration:none">',
    '<span style="color:' + COLORS.textMuted + '">' + escapeHtml(email.sender) + '</span>',
    ' &nbsp;&middot;&nbsp; ',
    escapeHtml(analysis.summary),
    '</a>',
    '</div>',
  ].join('');
}

/**
 * Skip line — just a count with breakdown
 */
function buildSkipLine(count, reasons) {
  var parts = [];
  var order = ['newsletter', 'promo', 'notification', 'system', 'other'];
  order.forEach(function(r) {
    if (reasons[r]) {
      var label = r === 'promo' ? 'promos' : r + 's';
      parts.push(reasons[r] + ' ' + label);
    }
  });
  var detail = parts.length > 0 ? ' (' + parts.join(', ') + ')' : '';

  return [
    buildDivider(),
    '<div style="text-align:center;color:' + COLORS.skipText + ';font-size:12px;padding:4px 0">',
    'Skipped: ' + count + ' email' + (count !== 1 ? 's' : '') + detail,
    '</div>',
  ].join('');
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * Action card — full detail with proposed reply and buttons
 */
function buildActionCard(analysis) {
  var email = analysis.email;

  var subjectHtml = [
    '<a href="' + email.gmailUrl + '" style="color:' + COLORS.headline + ';text-decoration:none;',
    'font-family:' + FONT_HEADLINE + ';font-size:16px;font-weight:600;line-height:1.4">',
    escapeHtml(email.subject),
    '</a>',
  ].join('');

  var metaHtml = [
    '<div style="color:' + COLORS.textMuted + ';font-size:12px;margin-top:2px">',
    escapeHtml(email.sender) + ' &nbsp;&middot;&nbsp; ' + escapeHtml(email.date),
    email.isThread ? ' &nbsp;&middot;&nbsp; thread' : '',
    '</div>',
  ].join('');

  var summaryHtml = [
    '<div style="color:' + COLORS.text + ';font-size:14px;line-height:1.6;margin-top:8px">',
    escapeHtml(analysis.summary),
    '</div>',
  ].join('');

  // Action items
  var actionsHtml = '';
  if (analysis.actionItems && analysis.actionItems.length > 0) {
    var items = analysis.actionItems.map(function(a) {
      return '<div style="margin-bottom:3px;font-size:13px;color:' + COLORS.text + '">&rarr; ' + escapeHtml(a) + '</div>';
    }).join('');
    actionsHtml = '<div style="margin-top:8px">' + items + '</div>';
  }

  // Proposed reply
  var replyHtml = '';
  if (analysis.proposedReply) {
    var replySubject = email.subject.match(/^re:/i) ? email.subject : 'Re: ' + email.subject;
    var mailtoHref = buildMailtoLink(email.senderEmail, replySubject, analysis.proposedReply);

    replyHtml = [
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid ' + COLORS.border + '">',
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;',
      'color:' + COLORS.textMuted + ';margin-bottom:6px">Proposed Reply</div>',
      '<div style="background:' + COLORS.replyBg + ';border-left:3px solid ' + COLORS.border + ';',
      'padding:10px 14px;font-size:13px;color:' + COLORS.text + ';line-height:1.6;',
      'white-space:pre-wrap;word-wrap:break-word">',
      escapeHtml(analysis.proposedReply),
      '</div>',
      '<div style="margin-top:10px">',
      '<a href="' + mailtoHref + '" style="display:inline-block;background:' + COLORS.accent + ';',
      'color:#fff;text-decoration:none;font-size:12px;font-weight:500;padding:7px 16px;',
      'border-radius:4px">Reply in Gmail</a>',
      ' &nbsp;',
      '<a href="' + email.gmailUrl + '" style="display:inline-block;color:' + COLORS.accent + ';',
      'text-decoration:none;font-size:12px;font-weight:500;padding:7px 16px;',
      'border:1px solid ' + COLORS.accent + ';border-radius:4px">Open Thread</a>',
      '</div>',
      '</div>',
    ].join('');
  }

  var errorBadge = analysis.error
    ? '<span style="background:' + COLORS.errorBg + ';color:#c5221f;font-size:11px;padding:2px 6px;border-radius:3px;margin-left:8px">analysis failed</span>'
    : '';

  return [
    '<div style="background:' + COLORS.actionBg + ';border:1px solid ' + COLORS.actionBorder + ';',
    'border-radius:6px;padding:16px 20px;margin:10px 0">',
    subjectHtml + errorBadge,
    metaHtml,
    summaryHtml,
    actionsHtml,
    replyHtml,
    '</div>',
  ].join('');
}

/**
 * FYI card — compact, no reply section
 */
function buildFyiCard(analysis) {
  var email = analysis.email;

  return [
    '<div style="background:' + COLORS.fyiBg + ';border:1px solid ' + COLORS.fyiBorder + ';',
    'border-radius:6px;padding:12px 18px;margin:8px 0">',
    '<a href="' + email.gmailUrl + '" style="color:' + COLORS.headline + ';text-decoration:none;',
    'font-family:' + FONT_HEADLINE + ';font-size:15px;font-weight:600;line-height:1.4">',
    escapeHtml(email.subject),
    '</a>',
    analysis.error ? '<span style="background:' + COLORS.errorBg + ';color:#c5221f;font-size:11px;padding:2px 6px;border-radius:3px;margin-left:8px">analysis failed</span>' : '',
    '<div style="color:' + COLORS.textMuted + ';font-size:12px;margin-top:2px">',
    escapeHtml(email.sender) + ' &nbsp;&middot;&nbsp; ' + escapeHtml(email.date),
    '</div>',
    '<div style="color:' + COLORS.text + ';font-size:13px;line-height:1.5;margin-top:6px">',
    escapeHtml(analysis.summary),
    '</div>',
    '<div style="margin-top:6px">',
    '<a href="' + email.gmailUrl + '" style="color:' + COLORS.accent + ';text-decoration:none;font-size:12px">',
    'Open in Gmail &rarr;</a>',
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Footer
 */
function buildFooter(cfg) {
  return [
    '<div style="text-align:center;color:' + COLORS.textMuted + ';font-size:11px;padding:20px 0 10px;',
    'font-family:' + FONT_HEADLINE + ';letter-spacing:0.5px">',
    escapeHtml(cfg.PERSONA_NAME) + ' &nbsp;&middot;&nbsp; Powered by ' + escapeHtml(cfg.AI_PROVIDER),
    '</div>',
  ].join('');
}

// ---------------------------------------------------------------------------
// Plain text fallback
// ---------------------------------------------------------------------------

/**
 * Builds a plain-text version of the briefing (for email client fallback).
 *
 * @param {string}           overallSummary
 * @param {EmailAnalysis[]}  analyses
 * @param {CalendarEvent[]}  calendarEvents
 * @returns {string}
 */
function buildBriefingPlainText(overallSummary, analyses, calendarEvents) {
  var lines = [
    'Morning Briefing — ' + formatToday(),
    '==========================================',
    '',
  ];

  // Calendar
  if (calendarEvents && calendarEvents.length > 0) {
    lines.push("TODAY'S SCHEDULE");
    lines.push('------------------------------------------');
    calendarEvents.forEach(function(e) {
      var time = e.isAllDay ? 'All day' : e.startTime;
      lines.push(time + '  ' + e.title);
    });
    lines.push('');
  }

  lines.push('OVERVIEW');
  lines.push(overallSummary);
  lines.push('');

  // Action emails
  var actionEmails = analyses.filter(function(a) { return a.category === 'action'; });
  if (actionEmails.length > 0) {
    lines.push('REQUIRES YOUR ATTENTION (' + actionEmails.length + ')');
    lines.push('------------------------------------------');
    actionEmails.forEach(function(a) {
      lines.push('');
      lines.push(a.email.subject);
      lines.push(a.email.sender + ' · ' + a.email.date);
      lines.push(a.summary);
      if (a.actionItems && a.actionItems.length > 0) {
        a.actionItems.forEach(function(item) { lines.push('→ ' + item); });
      }
      if (a.proposedReply) {
        lines.push('');
        lines.push('Proposed reply:');
        lines.push(a.proposedReply);
      }
      lines.push(a.email.gmailUrl);
    });
    lines.push('');
  }

  // FYI emails
  var fyiEmails = analyses.filter(function(a) { return a.category === 'fyi'; });
  if (fyiEmails.length > 0) {
    lines.push('WORTH READING (' + fyiEmails.length + ')');
    lines.push('------------------------------------------');
    fyiEmails.forEach(function(a) {
      lines.push(a.email.sender + ': ' + a.summary);
    });
    lines.push('');
  }

  // Skip count
  var skipCount = analyses.filter(function(a) { return a.category === 'skip'; }).length;
  if (skipCount > 0) {
    lines.push('Skipped: ' + skipCount + ' emails (newsletters, promos, notifications)');
    lines.push('');
  }

  lines.push('— Aurora');
  return lines.join('\n');
}
