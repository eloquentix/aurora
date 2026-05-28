/**
 * providers/gemini.gs — Google Gemini adapter
 *
 * API docs: https://ai.google.dev/api/generate-content
 * Uses API key auth (no OAuth required).
 * Default model: gemini-2.5-flash
 *
 * Free tier limits: ~10 RPM, low daily quota.
 * Retries automatically on 429 (rate limit) and 503 (overload).
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

  var fetchOpts = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  // Retry up to 3 times on 429 (rate limit) and 503 (overload)
  // Delays: 15s → 30s → 60s
  var retryDelays = [15000, 30000, 60000];

  for (var attempt = 0; attempt <= retryDelays.length; attempt++) {
    var response = UrlFetchApp.fetch(url, fetchOpts);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200) {
      var data = JSON.parse(body);
      return data.candidates[0].content.parts[0].text;
    }

    if ((code === 429 || code === 503) && attempt < retryDelays.length) {
      var delay = retryDelays[attempt];
      Logger.log('Gemini ' + code + ' — waiting ' + (delay / 1000) + 's before retry ' + (attempt + 1) + '...');
      Utilities.sleep(delay);
      continue;
    }

    throw new Error('AI API error (gemini): HTTP ' + code + ' — ' + truncate(body, 200));
  }
}
