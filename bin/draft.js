#!/usr/bin/env node
// Draft replies for new inbound messages and add them to the review queue.
//
//   node --env-file-if-exists=.env bin/draft.js --inbox examples/inbox.json
//
// With ANTHROPIC_API_KEY set, drafts come from Claude. Without it, from the
// offline mock (clearly labelled), so the whole flow can be tried for free.

import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { draftReply } from '../src/draft.js'
import { mockClient } from '../src/mockModel.js'
import { load, save, enqueue } from '../src/queue.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const profile = JSON.parse(readFileSync(opt('profile', 'examples/business.json'), 'utf8'))
const inbox = JSON.parse(readFileSync(opt('inbox', 'examples/inbox.json'), 'utf8'))
const queueFile = opt('queue', 'queue.json')
const queue = load(queueFile)

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 45_000, maxRetries: 2 }) : mockClient()
if (!process.env.ANTHROPIC_API_KEY) console.log('No ANTHROPIC_API_KEY: using the OFFLINE MOCK. Drafts are canned, not AI.\n')

const known = new Set(queue.map((q) => q.id))
const drafts = []
for (const message of inbox.filter((m) => !known.has(m.id))) {
  const d = await draftReply({ client, profile, message })
  drafts.push(d)
  const flag = d.needs_human ? `  ⚑ ${d.needs_human_reason}` : ''
  console.log(`${d.id}  ${d.intent.padEnd(13)} ${d.urgency.padEnd(6)} ${d.summary}${flag}`)
}

console.log(`\n${enqueue(queue, drafts)} drafts queued (source: ${[...new Set(drafts.map((d) => d.source))].join(', ') || 'none'})`)
save(queueFile, queue)
console.log(`review them: npm run review`)
