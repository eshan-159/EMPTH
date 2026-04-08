import { z } from 'zod';
import crypto from 'node:crypto';
import { llm, sarvam } from '@empth/services';
import { toolRegistry, toolDescriptions, toolRules } from '@empth/tools';

const ActionSchema = z.object({
  action: z.string(),
  parameters: z.record(z.any()).default({})
});

const MAX_STEPS = 3;

function requiresTool(intent, userText) {
  if (intent === 'folder' || intent === 'pdf' || intent === 'file_read' || intent === 'file_write') return true;
  // Also catch common phrasing that may not match intent regex.
  const t = userText.toLowerCase();
  if (/\b(convert|export)\b.*\bpdf\b/.test(t)) return true;
  if (/whatsapp|watsap|app|open|tell|msg|message|click|type|screen/i.test(t)) return true;
  return false;
}

function agentSystemPrompt() {
  const currentWorkDir = process.env.ASSISTANT_WORKDIR || process.cwd();
  return `You are a chill, quick-witted, and highly capable AI companion interfacing locally with your friend's computer. 
Current Working Directory: ${currentWorkDir}
Note: If the user asks to create a file on the Desktop and you are on it, just provide the filename.
You MUST respond with a single JSON object only (no markdown, no extra text).
You can either:
- Respond normally:
  {"action":"respond","parameters":{"text":"..."}}
  * CRITICAL FOR RESPOND: Treat the user like a friend or colleague. Do not sound like a servant or slave. No "As an AI", "I am here to serve", or overly formal apologies.
  * Be extremely casual, natural, cool, and brief. Use everyday language and slang where appropriate. 

- Or call exactly one tool:
  {"action":"TOOL_NAME","parameters":{...}}

${toolDescriptions}
${toolRules}
- After a tool call, verify the result success=true before responding.
- Be extremely brief, cool, and human-like in respond.text.`;
}

function followupSystemPrompt() {
  return `You are a local OS companion agent interfacing directly with your friend through voice.
Return ONLY JSON: {"action":"respond","parameters":{"text":"..."}}.
CRITICAL INSTRUCTION FOR TEXT: Write the \`text\` exactly as a human buddy would speak it in a casual, cool conversation.
- DO NOT sound like a servant. No "master" or "slave" dynamic. Act like an equal, chill co-pilot.
- Use contractions (I'll, you're, that's) and everyday language.
- Keep it very brief and highly conversational.
- Eliminate robotic, formal, or overly polite phrasing (e.g. avoid saying "I have executed the tool" or "The task is complete").
- Just say something natural like "Got it done!" or "Sent that over for you."
Do not call tools in this step.`;
}

function extractJsonObject(maybeText) {
  if (typeof maybeText !== 'string') return null;
  const trimmed = maybeText.trim();
  if (!trimmed) return null;

  // 1. Try passing the whole thing
  try {
    return JSON.parse(trimmed);
  } catch {
    // 2. Try to find the first valid JSON object by balancing braces
    let balance = 0;
    let start = trimmed.indexOf('{');
    if (start === -1) return null;
    
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === '{') balance++;
      else if (trimmed[i] === '}') balance--;

      if (balance === 0) {
        // Potential end of object
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // If parse fails (e.g. inside a string?), continue
          // Actually, if we are inside a string, we wouldn't count braces?
          // This simple counter fails for braces inside strings.
          // But it's better than nothing for now.
        }
      }
    }
    
    // 3. Fallback: try the old method (first to last brace)
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace > start) {
      try {
        return JSON.parse(trimmed.slice(start, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function classifyIntent(userText) {
  const t = userText.toLowerCase();
  if (/(folder|dir|directory)/.test(t)) return 'folder';
  if (/(pdf|document)/.test(t)) return 'pdf'; // Check PDF before generic file write
  if (/(write|save|create).*file/.test(t)) return 'file_write';
  if (/(read|open).*file/.test(t)) return 'file_read';
  return 'general';
}

/**
 * @param {{ userText: string, history: { append: (e:any)=>Promise<void> } }} input
 */
export async function runAgent(input) {
  const model = llm.createLLMFromEnv();

  /** @type {Array<{role: 'system'|'user'|'assistant', content: string}>} */
  const messages = [
    { role: 'system', content: agentSystemPrompt() },
    { role: 'user', content: input.userText }
  ];

  const startedAt = new Date().toISOString();
  const intent = classifyIntent(input.userText);

  let finalText = null;
  let lastAction = null;
  let ttsError = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const raw = await model.generateText({ messages, temperature: 0.2 });
    console.log('[Agent] Raw:', raw);
    const json = extractJsonObject(raw);

    if (!json) {
      finalText = raw;
      lastAction = 'respond';
      break;
    }

    const parsed = ActionSchema.safeParse(json);
    if (!parsed.success) {
      finalText = raw;
      lastAction = 'respond';
      break;
    }

    const { action, parameters } = parsed.data;
    lastAction = action;

    if (action === 'respond') {
      // If the request clearly needs a tool, force a retry with stricter instruction.
      if (step < MAX_STEPS - 1 && requiresTool(intent, input.userText)) {
        messages.push({ role: 'assistant', content: JSON.stringify({ action: 'respond', parameters }) });
        messages.push({
          role: 'system',
          content:
            'The user request requires using a tool. Return ONLY JSON for exactly ONE tool call (not respond). '
            + 'Pick the best tool and required parameters. No extra text.'
        });
        continue;
      }

      finalText = String(parameters?.text || '');
      break;
    }

    const tool = toolRegistry[action];
    if (!tool) {
      finalText = `Unknown tool: ${action}`;
      break;
    }

    let toolResult;
    try {
      toolResult = await tool(parameters);
    } catch (err) {
      toolResult = { error: String(err?.message || err), tool: action };
    }

    messages.push({ role: 'assistant', content: JSON.stringify({ action, parameters }) });
    messages.push({ role: 'user', content: `Tool result for ${action}: ${JSON.stringify(toolResult)}` });

    // Ask for final response (no more tools)
    messages.push({ role: 'system', content: followupSystemPrompt() });
    const raw2 = await model.generateText({ messages, temperature: 0.2 });
    const json2 = extractJsonObject(raw2);
    const parsed2 = ActionSchema.safeParse(json2);
    if (parsed2.success && parsed2.data.action === 'respond') {
      finalText = String(parsed2.data.parameters?.text || '');
    } else {
      finalText = typeof raw2 === 'string' ? raw2 : 'Done.';
    }
    break;
  }

  if (!finalText) finalText = 'No response.';

  let tts = null;
  try {
    tts = await sarvam.sarvamTTS({ text: finalText, format: 'wav' });
  } catch (err) {
    // TTS optional; do not fail the whole request.
    const base = String(err?.message || err);
    const body = err?.body;
    if (body !== undefined) {
      const bodySnippet = JSON.stringify(body).slice(0, 400);
      ttsError = `${base}: ${bodySnippet}`;
    } else {
      ttsError = base;
    }
  }

  const response = {
    text: finalText,
    audioBase64: tts?.audioBase64,
    audioMimeType: tts?.mimeType,
    meta: { intent, startedAt, lastAction, ttsError }
  };

  await input.history.append({
    id: crypto.randomUUID(),
    at: startedAt,
    input: input.userText,
    intent,
    lastAction,
    text: finalText
  });

  return response;
}
