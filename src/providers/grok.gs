/**
 * providers/grok.gs — xAI Grok adapter
 *
 * API docs: https://docs.x.ai/api
 * Grok uses an OpenAI-compatible API, so the shape is nearly identical
 * to openai.gs — different base URL and model name.
 * Default model: grok-3-mini-fast
 */

var GROK_DEFAULT_MODEL = 'grok-3';
var GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ systemPrompt: string, maxTokens: number, temperature: number }} opts
 * @param {string|null} modelOverride
 * @returns {string}
 */
function callGrok(apiKey, prompt, opts, modelOverride) {
  var model = modelOverride || GROK_DEFAULT_MODEL;

  var messages = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  var payload = {
    model: model,
    messages: messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  };

  var response = UrlFetchApp.fetch(GROK_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    throw new Error('AI API error (grok): HTTP ' + code + ' — ' + truncate(body, 200));
  }

  var data = JSON.parse(body);
  return data.choices[0].message.content;
}
