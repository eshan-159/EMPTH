import { z } from 'zod';
import { httpJson } from '../../net/http.js';

const GroqMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string()
});

export class GroqProvider {
  /** @param {{apiKey?: string, model: string, baseUrl?: string}} params */
  constructor(params) {
    this.apiKey = params.apiKey;
    this.model = params.model;
    this.baseUrl = (params.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  }

  /** @param {{messages: Array<{role: string, content: string}>, temperature?: number}} input */
  async generateText(input) {
    if (!this.apiKey) throw new Error('GROQ_API_KEY is required');

    const messages = z.array(GroqMessageSchema).parse(input.messages);

    const payload = await httpJson(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`
      },
      body: {
        model: this.model,
        messages,
        temperature: input.temperature ?? 0.2
      }
    });

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Groq response missing choices[0].message.content');
    }

    return content;
  }
}
