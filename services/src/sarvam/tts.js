import { httpJson } from '../net/http.js';

/**
 * Sarvam TTS wrapper.
 *
 * Uses env:
 * - SARVAM_API_KEY
 * - SARVAM_TTS_URL
 * - SARVAM_TTS_LANG (optional, default en-IN)
 * - SARVAM_TTS_SPEAKER (optional)
 *
 * Returns base64 audio so the frontend can play it as a data URL.
 *
 * @param {{ text: string, voice?: string, format?: 'wav'|'mp3' }} input
 * @returns {Promise<{ audioBase64: string, mimeType: string }>} 
 */
export async function sarvamTTS(input) {
  const apiKey = process.env.SARVAM_API_KEY;
  const url = process.env.SARVAM_TTS_URL || 'https://api.sarvam.ai/text-to-speech';

  if (!apiKey) throw new Error('SARVAM_API_KEY is required for TTS');

  // Sarvam REST TTS returns base64 WAV by default per docs.
  const format = input.format || 'wav';
  const targetLanguageCode = process.env.SARVAM_TTS_LANG || 'en-IN';

  // Do not send empty strings; Sarvam may validate strictly.
  const rawSpeaker = input.voice ?? process.env.SARVAM_TTS_SPEAKER;
  const speaker = rawSpeaker && String(rawSpeaker).trim() ? String(rawSpeaker).trim() : undefined;

  const payload = await httpJson(url, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey
    },
    body: (() => {
      const body = {
        text: input.text,
        target_language_code: targetLanguageCode
      };
      if (speaker) body.speaker = speaker;
      return body;
    })()
  });

  const audioBase64 =
    (Array.isArray(payload?.audios) && typeof payload.audios[0] === 'string' && payload.audios[0]) ||
    payload?.audioBase64 ||
    payload?.audio ||
    payload?.data?.audioBase64;
  if (typeof audioBase64 !== 'string') {
    throw new Error('Sarvam TTS response did not include audioBase64/audio');
  }

  const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
  return { audioBase64, mimeType };
}
