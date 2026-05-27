/**
 * briefing.gs — HTML email builder
 *
 * Produces a rich HTML email with:
 *   - Header with date
 *   - Overall summary box
 *   - Consolidated action items (linked to Gmail threads)
 *   - Per-email cards: summary, actions, proposed reply + mailto button
 *
 * All CSS is inline — email clients strip <style> blocks.
 */

// Color palette
var COLORS = {
  bg:           '#f5f5f5',
  card:         '#ffffff',
  accent:       '#1a73e8',
  accentDark:   '#1557b0',
  priority:     '#e8f0fe',
  priorityBorder: '#1a73e8',
  other:        '#ffffff',
  text:         '#202124',
  textMuted:    '#5f6368',
  border:       '#e0e0e0',
  actionBg:     '#fff8e1',
  actionBorder: '#f9ab00',
  replyBg:      '#f8f9fa',
  errorBg:      '#fce8e6',
};

/**
 * Builds the complete HTML email for the briefing.
 *
 * @param {string}         overallSummary
 * @param {EmailAnalysis[]} analyses
 * @param {Object}         cfg  Result of getConfig()
 * @returns {string}  HTML string
 */
function buildBriefingHTML(overallSummary, analyses, cfg) {
  var priorityAnalyses = analyses.filter(function(a) {
    return cfg.PRIORITY_CONTACTS.some(function(c) {
      return a.email.senderEmail.indexOf(c) !== -1;
    });
  });
  var otherAnalyses = analyses.filter(function(a) {
    return !cfg.PRIORITY_CONTACTS.some(function(c) {
      return a.email.senderEmail.indexOf(c) !== -1;
    });
  });

  var allActionItems = collectAllActionItems(analyses);

  var html = [
    buildHeader(cfg, analyses.length),
    buildSummaryBox(overallSummary),
    allActionItems.length > 0 ? buildActionItemsSection(allActionItems) : '',
    priorityAnalyses.length > 0 ? buildSection('Priority', priorityAnalyses, COLORS.priority, COLORS.priorityBorder) : '',
    otherAnalyses.length > 0   ? buildSection('Inbox', otherAnalyses, COLORS.other, COLORS.border) : '',
    analyses.length === 0 ? '<p style="text-align:center;color:' + COLORS.textMuted + ';padding:40px">Inbox is clear. Nothing new.</p>' : '',
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
    '<body style="margin:0;padding:0;background:' + COLORS.bg + ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + COLORS.bg + '">',
    '<tr><td align="center" style="padding:20px 10px">',
    '<table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%">',
    '<tr><td>',
    content,
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

/**
 * Header: "Good morning. Briefing for Monday, May 26 · 12 emails"
 */
function buildHeader(cfg, emailCount) {
  return [
    '<div style="background:' + COLORS.accent + ';border-radius:8px 8px 0 0;padding:24px 28px;margin-bottom:0">',
    '<div style="color:#fff;font-size:22px;font-weight:600">Good morning.</div>',
    '<div style="color:rgba(255,255,255,0.85);font-size:14px;margin-top:4px">',
    'Briefing for ' + formatToday() + ' &nbsp;·&nbsp; ' + emailCount + ' email' + (emailCount !== 1 ? 's' : ''),
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Summary box: the overall AI-generated summary
 */
function buildSummaryBox(summary) {
  return [
    '<div style="background:#e8f0fe;border-left:4px solid ' + COLORS.accent + ';padding:16px 20px;margin-bottom:16px">',
    '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;',
    'color:' + COLORS.accent + ';margin-bottom:6px">Overview</div>',
    '<div style="color:' + COLORS.text + ';font-size:14px;line-height:1.6">' + escapeHtml(summary) + '</div>',
    '</div>',
  ].join('');
}

/**
 * Consolidated action items list with links to Gmail threads
 */
function buildActionItemsSection(actionItems) {
  var items = actionItems.map(function(item) {
    var linkHtml = item.gmailUrl
      ? ' <a href="' + item.gmailUrl + '" style="color:' + COLORS.accent + ';text-decoration:none;font-size:12px">[open]</a>'
      : '';
    return '<li style="margin-bottom:8px;line-height:1.5">' + escapeHtml(item.text) + linkHtml + '</li>';
  }).join('');

  return [
    '<div style="background:' + COLORS.actionBg + ';border:1px solid ' + COLORS.actionBorder + ';',
    'border-radius:6px;padding:16px 20px;margin-bottom:16px">',
    '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;',
    'color:#b06000;margin-bottom:10px">Action Items</div>',
    '<ul style="margin:0;padding-left:20px;color:' + COLORS.text + ';font-size:14px">',
    items,
    '</ul>',
    '</div>',
  ].join('');
}

/**
 * A section (Priority or Inbox) with a list of email cards.
 */
function buildSection(title, analyses, bgColor, borderColor) {
  var cards = analyses.map(function(a) {
    return buildEmailCard(a, bgColor, borderColor);
  }).join('');

  return [
    '<div style="margin-bottom:8px">',
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;',
    'color:' + COLORS.textMuted + ';padding:8px 0 4px">' + escapeHtml(title) + ' (' + analyses.length + ')</div>',
    cards,
    '</div>',
  ].join('');
}

/**
 * A single email card: sender, subject (linked), summary, actions, proposed reply + mailto button.
 */
function buildEmailCard(analysis, bgColor, borderColor) {
  var email = analysis.email;

  // Subject line linked to Gmail
  var subjectHtml = [
    '<a href="' + email.gmailUrl + '" style="color:' + COLORS.text + ';text-decoration:none;',
    'font-size:15px;font-weight:600;line-height:1.4">',
    escapeHtml(email.subject),
    '</a>',
  ].join('');

  // Sender + date
  var metaHtml = [
    '<div style="color:' + COLORS.textMuted + ';font-size:12px;margin-top:3px">',
    escapeHtml(email.sender),
    ' &nbsp;·&nbsp; ',
    escapeHtml(email.date),
    email.isThread ? ' &nbsp;·&nbsp; thread' : '',
    '</div>',
  ].join('');

  // Summary
  var summaryHtml = [
    '<div style="color:' + COLORS.text + ';font-size:14px;line-height:1.6;margin-top:10px">',
    escapeHtml(analysis.summary),
    '</div>',
  ].join('');

  // Action items (card-level)
  var actionsHtml = '';
  if (analysis.actionItems && analysis.actionItems.length > 0) {
    var actionLines = analysis.actionItems.map(function(a) {
      return '<li style="margin-bottom:4px">' + escapeHtml(a) + '</li>';
    }).join('');
    actionsHtml = [
      '<div style="margin-top:10px">',
      '<ul style="margin:6px 0 0 0;padding-left:18px;color:' + COLORS.text + ';font-size:13px">',
      actionLines,
      '</ul>',
      '</div>',
    ].join('');
  }

  // Proposed reply
  var replyHtml = '';
  if (analysis.proposedReply) {
    var replySubject = email.subject.match(/^re:/i) ? email.subject : 'Re: ' + email.subject;
    var mailtoHref = buildMailtoLink(email.senderEmail, replySubject, analysis.proposedReply);

    replyHtml = [
      '<div style="margin-top:12px;border-top:1px solid ' + COLORS.border + ';padding-top:12px">',
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;',
      'color:' + COLORS.textMuted + ';margin-bottom:6px">Proposed Reply</div>',
      '<div style="background:' + COLORS.replyBg + ';border-left:3px solid ' + COLORS.border + ';',
      'padding:10px 14px;font-size:13px;color:' + COLORS.text + ';line-height:1.6;',
      'font-family:monospace;white-space:pre-wrap;word-wrap:break-word">',
      escapeHtml(analysis.proposedReply),
      '</div>',
      '<div style="margin-top:8px">',
      '<a href="' + mailtoHref + '" style="display:inline-block;background:' + COLORS.accent + ';',
      'color:#fff;text-decoration:none;font-size:12px;font-weight:500;padding:6px 14px;',
      'border-radius:4px">Reply in Gmail</a>',
      ' &nbsp;',
      '<a href="' + email.gmailUrl + '" style="display:inline-block;color:' + COLORS.accent + ';',
      'text-decoration:none;font-size:12px;font-weight:500;padding:6px 14px;',
      'border:1px solid ' + COLORS.accent + ';border-radius:4px">Open Thread</a>',
      '</div>',
      '</div>',
    ].join('');
  } else {
    replyHtml = [
      '<div style="margin-top:8px">',
      '<a href="' + email.gmailUrl + '" style="color:' + COLORS.accent + ';text-decoration:none;font-size:12px">',
      'Open in Gmail →</a>',
      '</div>',
    ].join('');
  }

  // Error indicator
  var errorBadge = analysis.error
    ? '<span style="background:' + COLORS.errorBg + ';color:#c5221f;font-size:11px;padding:2px 6px;border-radius:3px;margin-left:8px">analysis failed</span>'
    : '';

  return [
    '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';',
    'border-radius:6px;padding:16px 18px;margin-bottom:10px">',
    subjectHtml + errorBadge,
    metaHtml,
    summaryHtml,
    actionsHtml,
    replyHtml,
    '</div>',
  ].join('');
}

/**
 * Footer with provider info.
 */
function buildFooter(cfg) {
  return [
    '<div style="text-align:center;color:' + COLORS.textMuted + ';font-size:11px;padding:20px 0 10px">',
    'Generated by Secretary &nbsp;·&nbsp; Provider: ' + escapeHtml(cfg.AI_PROVIDER),
    '</div>',
  ].join('');
}

/**
 * Collects all action items from all analyses, tagged with their source email's Gmail URL.
 *
 * @param {EmailAnalysis[]} analyses
 * @returns {{ text: string, gmailUrl: string }[]}
 */
function collectAllActionItems(analyses) {
  var items = [];
  analyses.forEach(function(a) {
    if (a.actionItems && a.actionItems.length > 0) {
      a.actionItems.forEach(function(action) {
        items.push({ text: action, gmailUrl: a.email.gmailUrl });
      });
    }
  });
  return items;
}

/**
 * Builds a plain-text version of the briefing (for email client fallback).
 *
 * @param {string}          overallSummary
 * @param {EmailAnalysis[]} analyses
 * @returns {string}
 */
function buildBriefingPlainText(overallSummary, analyses) {
  var lines = [
    'Morning Briefing — ' + formatToday(),
    '==========================================',
    '',
    'OVERVIEW',
    overallSummary,
    '',
  ];

  var allActions = collectAllActionItems(analyses);
  if (allActions.length > 0) {
    lines.push('ACTION ITEMS');
    lines.push('------------------------------------------');
    allActions.forEach(function(item) {
      lines.push('→ ' + item.text);
    });
    lines.push('');
  }

  analyses.forEach(function(a) {
    lines.push('FROM: ' + a.email.sender + ' <' + a.email.senderEmail + '>');
    lines.push('SUBJECT: ' + a.email.subject);
    lines.push('DATE: ' + a.email.date);
    lines.push(a.email.gmailUrl);
    lines.push('');
    lines.push(a.summary);
    if (a.proposedReply) {
      lines.push('');
      lines.push('Proposed reply:');
      lines.push(a.proposedReply);
    }
    lines.push('------------------------------------------');
    lines.push('');
  });

  lines.push('— Secretary');
  return lines.join('\n');
}
