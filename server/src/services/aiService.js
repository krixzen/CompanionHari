/**
 * The one place this app ever talks to an AI service directly, instead of
 * the usual copy-paste bridge. It exists purely so a long "plan until my
 * coverage deadline" run can fetch several chunks' replies automatically
 * rather than a person pasting each one in turn.
 *
 * It hands back the same raw reply text a person would get back pasting the
 * identical prompt into Claude by hand, so callers run it through the exact
 * same schema check and review screen as every other AI-assisted feature —
 * nothing about the trust model changes just because the fetch is automatic.
 */
import { badRequest, forbidden } from '../lib/httpError.js';
import { getAiApiKey, getAiModel, verifyAiPin } from './settingsService.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8000;

export async function completeWithAnthropic(prompt, pin) {
  // Checked here, not just in the UI that prompts for it — a request that
  // skips straight past the prompt (or is sent by hand) is held to the same
  // rule as one made through the button.
  if (!verifyAiPin(pin)) {
    throw forbidden('That PIN is not right.');
  }

  const apiKey = getAiApiKey();
  if (!apiKey) {
    throw badRequest('No API key is set up for automatic planning yet — add one under Planner settings first.');
  }

  let response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: getAiModel(),
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    throw badRequest('Could not reach the AI service — check the internet connection and try again.');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `The AI service returned an error (${response.status}).`;
    // The UI's own toast for this is easy to miss on a run that takes a
    // minute — this line in the terminal is always there to check back on.
    console.error(`AI service request failed (${response.status}): ${message}`);
    throw badRequest(
      response.status === 401
        ? 'The AI service rejected that API key — check it was pasted in full under Planner settings.'
        : message
    );
  }

  const text = payload?.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    console.error('AI service replied with no usable text. Full response:', JSON.stringify(payload));
    throw badRequest('The AI service replied without any usable text — try again.');
  }

  return text;
}
