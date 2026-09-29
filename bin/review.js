#!/usr/bin/env node
// A local review page: read each draft next to the message, edit, approve or
// reject. Approved replies are written to outbox/ next to the queue file.
// Binds to 127.0.0.1 only.
//
//   node bin/review.js --queue queue.json --port 4600

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { load, save, approve, reject } from '../src/queue.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const queueFile = opt('queue', 'queue.json')
const port = Number(opt('port', 4600))
const page = readFileSync(new URL('../src/review.html', import.meta.url))

const readBody = (req) => new Promise((resolve) => {
  let s = ''
  req.on('data', (c) => (s += c))
  req.on('end', () => resolve(s ? JSON.parse(s) : {}))
})

const server = http.createServer(async (req, res) => {
  const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)) }
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(page)
    }
    if (req.method === 'GET' && req.url === '/api/queue') return json(200, load(queueFile))
    if (req.method === 'POST' && (req.url === '/api/approve' || req.url === '/api/reject')) {
      const { id, text } = await readBody(req)
      const items = load(queueFile)
      const item = req.url === '/api/approve' ? approve(items, id, text, join(dirname(queueFile), 'outbox')) : reject(items, id)
      save(queueFile, items)
      return json(200, item)
    }
    json(404, { error: 'not found' })
  } catch (err) {
    json(400, { error: err.message })
  }
})

server.listen(port, '127.0.0.1', () => console.log(`review drafts at http://127.0.0.1:${port}`))
