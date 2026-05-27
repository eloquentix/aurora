/**
 * providers/openai.gs — OpenAI Chat Completions adapter
 *
 * API docs: https://platform.openai.com/docs/api-reference/chat
 * Default model: gpt-4o-mini (fast, cheap, excellent quality)
 */

var OPENAI_DEFAULT_MODEL = 'gpt-4o';
var OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ systemPrompt: string, maxTokens: number, temperature: number }} opts
 * @param {string|null} modelOverride
 * @returns {string}
 */
function callOpenAI(apiKey, prompt, opts, modelOverride) {
  var model = modelOverride || OPENAI_DEFAULT_MODEL;

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

  var response = UrlFetchApp.fetch(OPENAI_API_URL, {
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
    throw new Error('AI API error (openai): HTTP ' + code + ' — ' + truncate(body, 200));
  }

  var data = JSON.parse(body);
  return data.choices[0].message.content;
}
