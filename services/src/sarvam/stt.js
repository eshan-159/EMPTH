import { httpFormData } from '../net/http.js';

/**
 * Sarvam STT wrapper.
 *
 * Uses env:
 * - SARVAM_API_KEY
 * - SARVAM_STT_URL
 *
 * @param {{ audioBuffer: Buffer, mimeType: string }} input
 * @returns {Promise<{ text: string }>} 
 */
export async function sarvamSTT(input) {
  const apiKey = process.env.SARVAM_API_KEY;
  const url = process.env.SARVAM_STT_URL || 'https://api.sarvam.ai/speech-to-text';

  if (!apiKey) throw new Error('SARVAM_API_KEY is required for STT');

  const form = new FormData();
  form.append('file', new Blob([input.audioBuffer], { type: input.mimeType }), 'audio.webm');
  // Defaults per docs; these are optional but improve consistency.
  form.append('model', 'saaras:v3');
  form.append('mode', 'transcribe');
  form.append('language_code', 'unknown');

  const payload = await httpFormData(url, {
    formData: form,
    headers: {
      'api-subscription-key': apiKey
    }
  });

  // Accept a couple of common shapes.
  const text = payload?.transcript || payload?.text || payload?.data?.text;
  if (typeof text !== 'string') {
    throw new Error('Sarvam STT response did not include text/transcript');
  }

  return { text };
}
