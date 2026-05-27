/**
 * ai.gs — AI provider abstraction layer
 *
 * This is the core of the "agent" pattern: a single callAI() function
 * that routes to whichever provider the user has configured.
 *
 * Adding a new provider:
 *   1. Create src/providers/myprovider.gs with callMyProvider(apiKey, prompt, opts)
 *   2. Add a case to the switch below
 *   3. Update CONFIG.AI_PROVIDER docs in config.gs
 *
 * All providers return a plain string (the model's text response).
 * JSON parsing, if needed, is the caller's responsibility.
 */

/**
 * Calls the configured AI provider with a prompt.
 *
 * @param {string} prompt           The user message / task prompt
 * @param {Object} [options]
 * @param {string} [options.systemPrompt]  System-level instruction for the model
 * @param {number} [options.maxTokens]     Max tokens in the response (default: 1024)
 * @param {number} [options.temperature]   Sampling temperature (default: 0.3)
 * @returns {string}  The model's text response
 */
function callAI(prompt, options) {
  var cfg = getConfig();
  var apiKey = getApiKey();
  var opts = {
    systemPrompt: '',
    maxTokens: 1024,
    temperature: 0.3,
  };

  // Merge caller options
  if (options) {
    if (options.systemPrompt !== undefined) opts.systemPrompt = options.systemPrompt;
    if (options.maxTokens   !== undefined) opts.maxTokens   = options.maxTokens;
    if (options.temperature !== undefined) opts.temperature = options.temperature;
  }

  // Route to the correct provider
  switch (cfg.AI_PROVIDER) {
    case 'claude':  return callClaude(apiKey, prompt, opts, cfg.AI_MODEL);
    case 'openai':  return callOpenAI(apiKey, prompt, opts, cfg.AI_MODEL);
    case 'gemini':  return callGemini(apiKey, prompt, opts, cfg.AI_MODEL);
    case 'grok':    return callGrok(apiKey, prompt, opts, cfg.AI_MODEL);
    default:
      throw new Error('Unknown AI provider: "' + cfg.AI_PROVIDER + '". Check AI_PROVIDER in config.');
  }
}
