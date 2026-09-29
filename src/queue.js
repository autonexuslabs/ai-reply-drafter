// queue.js — drafts waiting for a person, in one JSON file.
// Nothing leaves this queue except through approve().

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const load = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [])

export function save(file, items) {
  writeFileSync(`${file}.tmp`, JSON.stringify(items, null, 2) + '\n')
  renameSync(`${file}.tmp`, file)
}

/** Add drafts, skipping message ids already in the queue. */
export function enqueue(items, drafts) {
  const known = new Set(items.map((i) => i.id))
  const fresh = drafts.filter((d) => !known.has(d.id))
  items.push(...fresh)
  return fresh.length
}

/**
 * Mark approved and write the final text to the outbox. The outbox is the
 * hand-off point: point your mail sender at it, or copy from it by hand.
 */
export function approve(items, id, finalText, outboxDir = 'outbox') {
  const item = items.find((i) => i.id === id)
  if (!item || item.status !== 'pending') throw new Error(`no pending draft ${id}`)
  if (!String(finalText || '').trim()) throw new Error('refusing to approve an empty reply')
  item.status = 'approved'
  item.finalText = finalText
  item.edited = finalText.trim() !== String(item.draft).trim()
  item.decidedAt = new Date().toISOString()
  mkdirSync(outboxDir, { recursive: true })
  writeFileSync(join(outboxDir, `${id}.txt`), `To: ${item.from}\nSubject: Re: ${item.subject}\n\n${finalText.trim()}\n`)
  return item
}

export function reject(items, id) {
  const item = items.find((i) => i.id === id)
  if (!item || item.status !== 'pending') throw new Error(`no pending draft ${id}`)
  item.status = 'rejected'
  item.decidedAt = new Date().toISOString()
  return item
}
