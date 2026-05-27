/**
 * providers/gemini.gs — Google Gemini adapter
 *
 * API docs: https://ai.google.dev/api/generate-content
 * Uses API key auth (no OAuth required).
 * Default model: gemini-2.0-flash (fast, has a generous free tier)
 */

var GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
var GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ systemPrompt: string, maxTokens: number, temperature: number }} opts
 * @param {string|null} modelOverride
 * @returns {string}
 */
function callGemini(apiKey, prompt, opts, modelOverride) {
  var model = modelOverride || GEMINI_DEFAULT_MODEL;
  var url = GEMINI_API_BASE + model + ':generateContent?key=' + apiKey;

  var payload = {
    contents: [
      { parts: [{ text: prompt }] }
    ],
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      temperature: opts.temperature,
    },
  };

  if (opts.systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: opts.systemPrompt }]
    };
  }

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    throw new Error('AI API error (gemini): HTTP ' + code + ' — ' + truncate(body, 200));
  }

  var data = JSON.parse(body);
  return data.candidates[0].content.parts[0].text;
}
