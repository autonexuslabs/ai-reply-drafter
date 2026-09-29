// draft.js — one inbound message in, one reviewed-ready draft out.
//
// The model answers through a tool, so the result is always the same shape:
// intent, urgency, a one-line summary, the draft, what is missing, and whether
// a person must handle it. No parsing of free text. Newer models reject a
// forced tool_choice, so the choice is "auto" and the system prompt requires
// the call; a reply without it is an error, never a guess.

import { detectEmergency, scanDraft, EMERGENCY_SCRIPT } from './guard.js'

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export const TOOL = {
  name: 'draft_reply',
  description: 'Classify one inbound customer message and draft the reply.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['quote_request', 'booking', 'question', 'complaint', 'emergency', 'spam', 'other'] },
      urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
      summary: { type: 'string', description: 'One line for the owner: who wants what.' },
      draft: { type: 'string', description: 'The reply email body, ready to send after review. Empty for spam.' },
      missing_info: { type: 'array', items: { type: 'string' }, description: 'What the office still needs from the customer.' },
      needs_human: { type: 'boolean', description: 'True when a person should handle this rather than just approve the draft.' },
      needs_human_reason: { type: 'string' },
    },
    required: ['intent', 'urgency', 'summary', 'draft', 'missing_info', 'needs_human'],
  },
}

export function systemPrompt(p) {
  return `You draft email replies for ${p.name}. ${p.owner} reads every draft, edits it if needed, and sends it. You never send anything.

Business facts, the ONLY facts you may state:
- Services: ${p.services.join(', ')}.
- Service area: ${p.serviceArea.join(', ')}.
- Hours: ${p.hours}
- Phone: ${p.phone}. Website: ${p.website}.
${p.policies.map((x) => `- ${x}`).join('\n')}

How to write:
- Short, warm, plain. Three to six sentences. No marketing language, no exclamation marks.
- Answer what they asked using only the facts above. If the facts do not answer it, say ${p.owner} will find out, and do not guess.
- Never quote, estimate or hint at a price, not even a range. Explain the free in-home estimate instead.
- Never promise an arrival time, a same-day visit or a guarantee. Offer to book a two-hour window and say the office confirms it by text.
- Never diagnose equipment. You may say what the technician will check.
- Ask for exactly what is missing to book: address, a good phone number, preferred days.
- End with this signature:
${p.signature}

Classify honestly. A complaint needs a human even when you draft an apology. Spam gets intent "spam" and an empty draft.

Always answer by calling the draft_reply tool exactly once. Do not write anything outside it.`
}

/**
 * @param {object} p
 * @param {object} p.client   an Anthropic client (or the offline mock)
 * @param {object} p.profile  business profile
 * @param {object} p.message  { id, from, subject, body }
 */
export async function draftReply({ client, profile, message }) {
  const base = { id: message.id, from: message.from, subject: message.subject, body: message.body, status: 'pending', createdAt: new Date().toISOString() }

  const emergency = detectEmergency(`${message.subject}\n${message.body}`)
  if (emergency) {
    return {
      ...base, source: 'safety-script', intent: 'emergency', urgency: 'high',
      summary: `Possible emergency (${emergency}). Call the customer now.`,
      draft: `${EMERGENCY_SCRIPT(profile)}\n\n${profile.signature}`, missing_info: [],
      needs_human: true, needs_human_reason: `${emergency}: the model was not asked. Phone them, do not rely on email.`, flags: [],
    }
  }

  const reply = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: [{ type: 'text', text: systemPrompt(profile), cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `From: ${message.from}\nSubject: ${message.subject}\n\n${message.body}` }],
  })
  const out = reply.content.find((b) => b.type === 'tool_use')?.input
  if (!out) throw new Error(`no draft returned for ${message.id}`)

  const flags = out.draft ? scanDraft(out.draft, profile) : []
  return {
    ...base,
    source: reply.model || MODEL,
    ...out,
    needs_human: out.needs_human || flags.length > 0,
    needs_human_reason: [out.needs_human_reason, ...flags].filter(Boolean).join('; '),
    flags,
  }
}
