import { z } from 'zod';
import { runAgent } from '../agent/agent.js';
import { HistoryStore } from '../agent/historyStore.js';
import { sarvam } from '@empth/services';

const MessageBodySchema = z.object({
  text: z.string().min(1)
});

const history = new HistoryStore();

export async function registerAgentRoutes(app) {
  app.post('/api/agent/message', async (req, reply) => {
    try {
      const body = MessageBodySchema.parse(req.body);
      const result = await runAgent({ userText: body.text, history });
      return reply.send(result);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({
        error: String(err?.message || err),
        hint: 'Check your .env for LLM_PROVIDER + API keys (and Sarvam URLs if using voice/TTS).'
      });
    }
  });

  app.post('/api/agent/voice', async (req, reply) => {
    try {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });

      const chunks = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const audioBuffer = Buffer.concat(chunks);

      const stt = await sarvam.sarvamSTT({ audioBuffer, mimeType: file.mimetype });
      const result = await runAgent({ userText: stt.text, history });
      return reply.send({ ...result, transcript: stt.text });
    } catch (err) {
      req.log.error(err);
      const base = String(err?.message || err);
      const body = err?.body;
      const bodySnippet = body !== undefined ? JSON.stringify(body).slice(0, 400) : undefined;
      return reply.code(500).send({
        error: bodySnippet ? `${base}: ${bodySnippet}` : base,
        hint: 'Check SARVAM_API_KEY + SARVAM_STT_URL, and your LLM provider env vars.'
      });
    }
  });

  app.get('/api/history', async () => {
    return history.list();
  });
}
