/**
 * providers/claude.gs — Anthropic Claude adapter
 *
 * API docs: https://docs.anthropic.com/en/api/messages
 * Default model: claude-haiku-4-5-20251001 (fast, cheap, good for summarization)
 */

var CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-6';
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_API_VERSION = '2023-06-01';

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ systemPrompt: string, maxTokens: number, temperature: number }} opts
 * @param {string|null} modelOverride
 * @returns {string}
 */
function callClaude(apiKey, prompt, opts, modelOverride) {
  var model = modelOverride || CLAUDE_DEFAULT_MODEL;

  var payload = {
    model: model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: [
      { role: 'user', content: prompt }
    ],
  };

  if (opts.systemPrompt) {
    payload.system = opts.systemPrompt;
  }

  var response = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_API_VERSION,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    throw new Error('AI API error (claude): HTTP ' + code + ' — ' + truncate(body, 200));
  }

  var data = JSON.parse(body);
  return data.content[0].text;
}
