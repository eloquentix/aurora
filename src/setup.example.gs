/**
 * setup.example.gs — Template for setting Script Properties
 *
 * HOW TO USE:
 *   1. Copy this file to src/setup.gs  (it's gitignored — safe to add real keys)
 *   2. Fill in your API keys below
 *   3. clasp push
 *   4. Run setupProperties() from the Apps Script editor (or: clasp run setupProperties)
 *   5. Done. Re-run only when keys change.
 *
 * To switch providers later: just change AI_PROVIDER and re-run setupProperties().
 */

function setupProperties() {
  PropertiesService.getScriptProperties().setProperties({

    // Which provider to use: 'claude' | 'openai' | 'gemini' | 'grok'
    'AI_PROVIDER':     'claude',

    // API keys — fill in the ones you have (unused ones are ignored)
    'CLAUDE_API_KEY':  '',   // https://console.anthropic.com
    'OPENAI_API_KEY':  '',   // https://platform.openai.com
    'GEMINI_API_KEY':  '',   // https://aistudio.google.com
    'GROK_API_KEY':    '',   // https://console.x.ai

    // Optional overrides (remove lines you don't want to change)
    // 'AI_MODEL':          'claude-haiku-4-5-20251001',
    // 'HOURS_BACK':        '20',
    // 'MAX_EMAILS':        '50',
    // 'BRIEFING_HOUR':     '7',
    // 'PRIORITY_CONTACTS': 'alice@company.com,bob@startup.io',
    // 'PERSONA_NAME':      'MoneyPenny',

  });

  Logger.log('Properties set. Provider: ' + PropertiesService.getScriptProperties().getProperty('AI_PROVIDER'));
}
