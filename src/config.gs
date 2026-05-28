/**
 * config.gs — Configuration layer
 *
 * Two layers:
 *   1. CONFIG object below — defaults you can edit directly in code
 *   2. Script Properties — override anything at runtime without touching code
 *      Set via: Apps Script editor > Project Settings > Script Properties
 *
 * Secret keys (AI_API_KEY) must be set in Script Properties — never commit them.
 */

var CONFIG = {
  // Which AI provider to use: 'claude' | 'openai' | 'gemini' | 'grok'
  AI_PROVIDER: 'claude',

  // Override the default model for the chosen provider (null = use default)
  // e.g. 'claude-opus-4-6', 'gpt-4o', 'gemini-2.0-flash', 'grok-3'
  AI_MODEL: null,

  // How many hours back to scan the inbox
  HOURS_BACK: 20,

  // Maximum number of emails to process (prevents runaway API costs)
  // Gemini free tier: 10 req/min — at 6s delay, 25 emails takes ~2.5 min (safe)
  // Paid providers (Claude, OpenAI, Grok): 50 is fine
  MAX_EMAILS: 50,

  // Maximum characters of email body to send to the AI
  MAX_BODY_CHARS: 800,

  // Email addresses to treat as high-priority (replies from people you've reached out to)
  // e.g. ['colleague@company.com', 'client@startup.io']
  PRIORITY_CONTACTS: [],

  // Hour to send the briefing (24h, user's timezone)
  BRIEFING_HOUR: 7,

  // The agent's name as it appears in the briefing
  PERSONA_NAME: 'Aurora',
};

// ---------------------------------------------------------------------------
// Internal helpers — you probably don't need to edit below this line
// ---------------------------------------------------------------------------

/**
 * Returns merged config: CODE defaults + Script Properties overrides.
 * Script Properties always win.
 */
function getConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var cfg = {};

  // Copy defaults
  for (var key in CONFIG) {
    cfg[key] = CONFIG[key];
  }

  // Apply overrides from Script Properties
  if (props.AI_PROVIDER) cfg.AI_PROVIDER = props.AI_PROVIDER.trim().toLowerCase();
  if (props.AI_MODEL)    cfg.AI_MODEL    = props.AI_MODEL.trim();
  if (props.HOURS_BACK)  cfg.HOURS_BACK  = parseInt(props.HOURS_BACK, 10);
  if (props.MAX_EMAILS)  cfg.MAX_EMAILS  = parseInt(props.MAX_EMAILS, 10);
  if (props.BRIEFING_HOUR) cfg.BRIEFING_HOUR = parseInt(props.BRIEFING_HOUR, 10);
  if (props.PERSONA_NAME)  cfg.PERSONA_NAME  = props.PERSONA_NAME.trim();

  if (props.PRIORITY_CONTACTS) {
    cfg.PRIORITY_CONTACTS = props.PRIORITY_CONTACTS
      .split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
  }

  return cfg;
}

/**
 * Returns the API key for the currently configured provider.
 * Each provider has its own named key (CLAUDE_API_KEY, OPENAI_API_KEY, etc.)
 * so you can store all 4 and switch providers without swapping keys.
 *
 * Also accepts the generic AI_API_KEY as a fallback.
 */
function getApiKey() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var provider = getProvider();

  var providerKeyMap = {
    'claude': 'CLAUDE_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'grok':   'GROK_API_KEY',
  };

  var providerKeyName = providerKeyMap[provider];
  var key = providerKeyName ? props[providerKeyName] : null;

  // Fall back to generic AI_API_KEY if provider-specific one isn't set
  if (!key || key.trim() === '') {
    key = props['AI_API_KEY'];
  }

  if (!key || key.trim() === '') {
    throw new Error(
      'No API key found for provider "' + provider + '". ' +
      'Set ' + (providerKeyName || 'AI_API_KEY') + ' in Script Properties ' +
      'by running setupProperties() from setup.gs.'
    );
  }

  return key.trim();
}

/**
 * Returns the active provider name, normalized to lowercase.
 */
function getProvider() {
  return getConfig().AI_PROVIDER;
}

/**
 * Returns the delay in ms to wait between AI calls.
 * Gemini free tier: 10 RPM = one call every 6 seconds minimum.
 * Paid providers have much higher limits — 400ms is a safe courtesy delay.
 */
function getCallDelay() {
  var provider = getProvider();
  if (provider === 'gemini') return 6500; // ~9 RPM — safely under the 10 RPM free limit
  return 400;
}

/**
 * Validates config at startup. Returns array of error strings (empty = all good).
 */
function validateConfig() {
  var errors = [];
  var cfg = getConfig();

  var validProviders = ['claude', 'openai', 'gemini', 'grok'];
  if (validProviders.indexOf(cfg.AI_PROVIDER) === -1) {
    errors.push('AI_PROVIDER must be one of: ' + validProviders.join(', ') + '. Got: ' + cfg.AI_PROVIDER);
  }

  try {
    getApiKey();
  } catch (e) {
    errors.push(e.message);
  }

  if (isNaN(cfg.HOURS_BACK) || cfg.HOURS_BACK < 1) {
    errors.push('HOURS_BACK must be a positive number.');
  }

  return errors;
}
