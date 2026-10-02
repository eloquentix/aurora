/**
 * providers/claude.gs — Anthropic Claude adapter
 *
 * API docs: https://docs.anthropic.com/en/api/messages
 *
 * Default model: claude-haiku-4-5 ($1/$5 per Mtok). Each briefing makes one
 * short call per email — classify, summarize, draft a reply — which is squarely
 * Haiku work, and it is the whole cost of running Aurora (~40 calls a day vs
 * one for the overall summary). Sonnet 4.6, the previous default, costs 3x the
 * same work. If the ownership/delegation judgement starts slipping, set the
 * AI_MODEL Script Property to 'claude-sonnet-5' ($2/$10).
 */

var CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5';
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_API_VERSION = '2023-06-01';

// Models that removed the sampling parameters — sending `temperature` to one of
// these is a 400, so it is dropped for them.
var CLAUDE_NO_TEMPERATURE = /^claude-(opus-5|opus-4-7|opus-4-8|sonnet-5|fable-|mythos-)/;

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
    messages: [
      { role: 'user', content: prompt }
    ],
  };

  if (!CLAUDE_NO_TEMPERATURE.test(model)) {
    payload.temperature = opts.temperature;
  }

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
