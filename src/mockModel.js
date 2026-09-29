// mockModel.js — an OFFLINE stand-in for the Anthropic client, so the demo,
// the tests and the review UI work with no API key. It answers with canned,
// rule-picked drafts and reports its model as "offline-mock", which the queue
// and the UI both show. It is not AI; set ANTHROPIC_API_KEY for real drafts.

const pick = (text, rules) => rules.find(([re]) => re.test(text))?.[1] ?? rules.at(-1)[1]

export function mockClient() {
  return {
    messages: {
      async create({ messages }) {
        const text = messages.at(-1).content
        const input = pick(text, [
          [/page 1 of google|seo|free audit/i, { intent: 'spam', urgency: 'low', summary: 'SEO sales pitch.', draft: '', missing_info: [], needs_human: false }],
          [/disappointed|not happy|mess/i, { intent: 'complaint', urgency: 'high', summary: 'Unhappy customer after a recent visit.', draft: 'I am sorry about the state we left your basement in and that the thermostat still is not working. That is not how we want a visit to end. Maria will call you today to set up a return visit at no charge for the thermostat.\n\nMaria\nNorthwind Heating & Air\n(816) 555-0101', missing_info: ['best time to call'], needs_human: true, needs_human_reason: 'complaint' }],
          [/how much|cost|price|charge/i, { intent: 'quote_request', urgency: 'normal', summary: 'Wants a furnace replacement price.', draft: 'Thanks for reaching out. We do not quote replacement prices by email, because the right furnace depends on your home, but a technician can give you a written estimate at your home and that visit is free.\n\nIf you send your address and a couple of days that work, we will book a two-hour window and text you to confirm.\n\nMaria\nNorthwind Heating & Air\n(816) 555-0101', missing_info: ['address', 'preferred days'], needs_human: false }],
          [/.*/s, { intent: 'booking', urgency: 'normal', summary: 'Wants a repair visit.', draft: 'Thanks for letting us know. We can book a two-hour window for a technician to take a look, and the office will text you to confirm the time.\n\nCould you send your address and the best number to reach you?\n\nMaria\nNorthwind Heating & Air\n(816) 555-0101', missing_info: ['address', 'phone number'], needs_human: false }],
        ])
        return { model: 'offline-mock', content: [{ type: 'tool_use', name: 'draft_reply', input }] }
      },
    },
  }
}
