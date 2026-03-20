import { z } from 'zod';
import { httpJson } from '../../net/http.js';

const AnthropicMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
});

export class AnthropicProvider {
  /** @param {{apiKey?: string, model: string}} params */
  constructor(params) {
    this.apiKey = params.apiKey;
    this.model = params.model;
  }

  /** @param {{messages: Array<{role: string, content: string}>, temperature?: number}} input */
  async generateText(input) {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is required');

    // Anthropic Messages API does not accept 'system' in messages; it uses top-level system.
    const system = input.messages.find((m) => m.role === 'system')?.content;
    const messages = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    z.array(AnthropicMessageSchema).parse(messages);

    const payload = await httpJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: this.model,
        max_tokens: 1024,
        temperature: input.temperature ?? 0.2,
        system,
        messages
      }
    });

    const parts = payload?.content;
    const text = Array.isArray(parts) ? parts.filter((p) => p?.type === 'text').map((p) => p.text).join('') : null;

    if (!text) throw new Error('Anthropic response missing content text');
    return text;
  }
}
