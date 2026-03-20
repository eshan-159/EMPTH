import { httpJson } from '../../net/http.js';

export class OllamaProvider {
  /** @param {{ baseUrl: string, model: string }} params */
  constructor(params) {
    this.baseUrl = (params.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.model = params.model;
  }

  /** @param {{messages: Array<{role: string, content: string}>, temperature?: number}} input */
  async generateText(input) {
    if (!this.model) throw new Error('OLLAMA_MODEL is required when LLM_PROVIDER=ollama');

    // Ollama expects roles: system/user/assistant
    const messages = input.messages
      .filter((m) => ['system', 'user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: m.content }));

    const payload = await httpJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      body: {
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: input.temperature ?? 0.2
        }
      }
    });

    const content = payload?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama response missing message.content');
    }

    return content;
  }
}
