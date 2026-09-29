// guard.js — the rules that live in code, not in the prompt.
//
// A prompt can be ignored, forgotten half-way through a long message, or
// talked around by a clever customer. So two things never depend on it:
//
//   1. Emergencies. A gas smell, carbon monoxide, smoke or fire is detected
//      on the INBOUND text before the model is called, and answered with one
//      approved script. The model is never asked to improvise safety advice.
//
//   2. Promises. Every draft is scanned before it reaches the review queue.
//      A price, a guaranteed time, or a phone number / link the business
//      profile does not contain marks the draft as needing a human and says
//      why, instead of silently trimming the sentence.

export const EMERGENCY_SCRIPT = (profile) =>
  `If you smell gas or a carbon monoxide alarm is sounding, please leave the house now and call 911 from outside. ` +
  `Don't switch lights or appliances on or off on the way out. Once you're safe, call our emergency line at ${profile.phone}, which is answered around the clock.`

const EMERGENCY = [
  [/\b(smell|smells|smelling|odou?r of) (of )?(natural gas|gas|propane)\b|\bgas (smell|leak|leaking|odou?r)\b|\brotten eggs?\b/i, 'gas smell'],
  [/\bcarbon monoxide\b|\bco (alarm|detector)\b/i, 'carbon monoxide'],
  [/\bsmoke\b|\bon fire\b|\bflames?\b|\bsparks?\b|\bsparking\b/i, 'smoke, fire or sparks'],
]

/** @returns {string|null} why the inbound message is an emergency */
export function detectEmergency(text) {
  const hit = EMERGENCY.find(([re]) => re.test(text))
  return hit ? hit[1] : null
}

const PROMISES = [
  [/\$\s?\d|\b\d[\d,]*\s?(dollars|usd)\b|\bper hour\b/i, 'mentions a price'],
  [/\bguarantee[ds]?\b/i, 'makes a guarantee'],
  [/\b(within|in) (an?|one|two|\d+) (hours?|minutes?)\b|\bright away\b|\bsame[- ]day\b/i, 'promises a response time'],
  [/\b(confirmed|you('| a)re booked|booked you|see you (on|at))\b/i, 'confirms a booking the office has not made'],
]

/**
 * @param {string} draft
 * @param {object} profile  the business profile; its phone and website are allowed
 * @returns {string[]} problems, empty when the draft is clean
 */
export function scanDraft(draft, profile) {
  const problems = PROMISES.filter(([re]) => re.test(draft)).map(([, why]) => why)
  const allowedDigits = String(profile.phone || '').replace(/\D/g, '')
  for (const m of draft.matchAll(/\(?\d{3}\)?[-. ]?\d{3}[-. ]\d{4}/g)) {
    if (m[0].replace(/\D/g, '') !== allowedDigits) problems.push(`phone number not in the profile: ${m[0]}`)
  }
  const allowedHost = profile.website ? new URL(profile.website).hostname : null
  for (const m of draft.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
    if (new URL(m[0]).hostname !== allowedHost) problems.push(`link not in the profile: ${m[0]}`)
  }
  return problems
}
