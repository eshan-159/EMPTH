import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { GroqProvider } from './providers/groq.js';

export function createLLMFromEnv() {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

  if (provider === 'groq') {
    return new GroqProvider({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
    });
  }

  if (provider === 'ollama') {
    return new OllamaProvider({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b'
    });
  }

  if (provider === 'openai') {
    return new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com'
    });
  }

  if (provider === 'anthropic') {
    return new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
    });
  }

  if (provider === 'gemini') {
    return new GeminiProvider({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro'
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
