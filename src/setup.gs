/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║              AURORA SETUP — STEP 1 OF 2                  ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  1. Get a FREE Gemini key:                                ║
 * ║     → Go to https://aistudio.google.com                  ║
 * ║     → Click "Get API key" on the left, then               ║
 * ║       "Create API key" on the right                       ║
 * ║     → Copy the key and paste it below                    ║
 * ║                                                          ║
 * ║  2. Click the ▶ Run button above                         ║
 * ║     Make sure "setupProperties" is selected              ║
 * ║                                                          ║
 * ║  3. Google will ask for permissions — approve ALL of     ║
 * ║     them. If you see "Google hasn't verified this app",  ║
 * ║     click "Advanced" → "Go to Aurora (unsafe)" →        ║
 * ║     "Allow". This is normal for personal scripts.        ║
 * ║                                                          ║
 * ║  Then go to src/main.gs and run installTrigger()         ║
 * ╚══════════════════════════════════════════════════════════╝
 */

function setupProperties() {

  // ─── PASTE YOUR KEY HERE ──────────────────────────────────────────────────
  var GEMINI_KEY = 'PASTE_YOUR_GEMINI_KEY_HERE'; // free at https://aistudio.google.com
  // ─────────────────────────────────────────────────────────────────────────

  PropertiesService.getScriptProperties().setProperties({
    'AI_PROVIDER':    'gemini',
    'GEMINI_API_KEY': GEMINI_KEY,

    // Using a different provider? Comment out the two lines above and
    // uncomment one of the blocks below:

    // --- Claude (Anthropic) ---
    // 'AI_PROVIDER':    'claude',
    // 'CLAUDE_API_KEY': 'PASTE_YOUR_CLAUDE_KEY_HERE',  // console.anthropic.com

    // --- OpenAI ---
    // 'AI_PROVIDER':    'openai',
    // 'OPENAI_API_KEY': 'PASTE_YOUR_OPENAI_KEY_HERE',  // platform.openai.com

    // --- Grok (xAI) ---
    // 'AI_PROVIDER':    'grok',
    // 'GROK_API_KEY':   'PASTE_YOUR_GROK_KEY_HERE',    // console.x.ai
  });

  Logger.log('✓ API key saved. Provider: gemini');
  Logger.log('Next: open src/main.gs → run testBriefing() to preview your first briefing');
  Logger.log('Then: run installTrigger() to go live every morning');
}
