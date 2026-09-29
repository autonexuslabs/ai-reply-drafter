import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectEmergency, scanDraft } from '../src/guard.js'
import { draftReply, TOOL } from '../src/draft.js'
import { mockClient } from '../src/mockModel.js'
import { enqueue, approve, reject } from '../src/queue.js'

const profile = JSON.parse(readFileSync(new URL('../examples/business.json', import.meta.url), 'utf8'))

test('emergencies are detected on the inbound text', () => {
  assert.equal(detectEmergency('strong gas smell near the water heater'), 'gas smell')
  assert.equal(detectEmergency('our CO alarm keeps going off'), 'carbon monoxide')
  assert.equal(detectEmergency('the outlet is sparking'), 'smoke, fire or sparks')
  assert.equal(detectEmergency('we have a gas furnace that rattles'), null)
})

test('an emergency never reaches the model', async () => {
  let called = false
  const client = { messages: { create: async () => { called = true } } }
  const d = await draftReply({ client, profile, message: { id: '1', from: 'a', subject: 'help', body: 'I smell gas in the kitchen' } })
  assert.equal(called, false)
  assert.equal(d.intent, 'emergency')
  assert.equal(d.needs_human, true)
  assert.match(d.draft, /call 911 from outside/)
})

test('the scan flags prices, guarantees, time promises and invented contacts', () => {
  const p = (t) => scanDraft(t, profile)
  assert.deepEqual(p('A new furnace is usually $3,500.'), ['mentions a price'])
  assert.deepEqual(p('We guarantee it.'), ['makes a guarantee'])
  assert.deepEqual(p('Someone will be there within 2 hours.'), ['promises a response time'])
  assert.deepEqual(p("You're booked for Thursday."), ['confirms a booking the office has not made'])
  assert.deepEqual(p('Call (816) 555-0199.'), ['phone number not in the profile: (816) 555-0199'])
  assert.deepEqual(p('See https://cheap-parts.example/x'), ['link not in the profile: https://cheap-parts.example/x'])
  assert.deepEqual(p('Call us at (816) 555-0101 or visit https://northwind-heating.example/book.'), [])
})

test('a flagged draft is sent to a human with the reason', async () => {
  const client = { messages: { create: async () => ({ model: 'm', content: [{ type: 'tool_use', name: 'draft_reply', input: {
    intent: 'quote_request', urgency: 'normal', summary: 's', draft: 'It will be about $200.', missing_info: [], needs_human: false,
  } }] }) } }
  const d = await draftReply({ client, profile, message: { id: '2', from: 'a', subject: 'price', body: 'how much?' } })
  assert.equal(d.needs_human, true)
  assert.match(d.needs_human_reason, /mentions a price/)
})

test('no tool call is an error, never a guess', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'Sure!' }] }) } }
  await assert.rejects(draftReply({ client, profile, message: { id: '3', from: 'a', subject: 's', body: 'b' } }), /no draft returned/)
})

test('the offline mock produces the same shape as the tool schema', async () => {
  const d = await draftReply({ client: mockClient(), profile, message: { id: '4', from: 'a', subject: 'cost', body: 'how much to replace?' } })
  for (const k of TOOL.input_schema.required) assert.ok(k in d, k)
  assert.equal(d.source, 'offline-mock')
})

test('queue: dedupe, approve writes the outbox, empty approvals are refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'q-'))
  const items = []
  assert.equal(enqueue(items, [{ id: 'a', status: 'pending', draft: 'Hi', from: 'x', subject: 's' }]), 1)
  assert.equal(enqueue(items, [{ id: 'a', status: 'pending' }]), 0)
  assert.throws(() => approve(items, 'a', '   ', dir), /empty reply/)
  const done = approve(items, 'a', 'Hi there', dir)
  assert.equal(done.edited, true)
  assert.match(readFileSync(join(dir, 'a.txt'), 'utf8'), /Subject: Re: s\n\nHi there/)
  assert.throws(() => reject(items, 'a'), /no pending draft/)
})
