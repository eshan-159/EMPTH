import { httpJson } from '../../net/http.js';

export class GeminiProvider {
  /** @param {{apiKey?: string, model: string}} params */
  constructor(params) {
    this.apiKey = params.apiKey;
    this.model = params.model;
  }

  /** @param {{messages: Array<{role: string, content: string}>, temperature?: number}} input */
  async generateText(input) {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY is required');

    // Minimal mapping to Gemini generateContent.
    const system = input.messages.find((m) => m.role === 'system')?.content;
    const turns = input.messages.filter((m) => m.role !== 'system');

    const contents = turns.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    if (system) {
      contents.unshift({ role: 'user', parts: [{ text: system }] });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = await httpJson(url, {
      method: 'POST',
      body: {
        contents,
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: 1024
        }
      }
    });

    const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Gemini response missing candidates[0].content.parts text');
    }

    return text;
  }
}
