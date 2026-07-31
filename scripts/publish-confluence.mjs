#!/usr/bin/env node
// Publishes a Playwright run summary to a single (fixed) Confluence page.
// Env: CONFLUENCE_BASE (https://your.atlassian.net), CONFLUENCE_USER (email),
//      CONFLUENCE_TOKEN (API token), CONFLUENCE_PAGE_ID.
// Usage: node scripts/publish-confluence.mjs playwright-report/results.json
// Self-check: node scripts/publish-confluence.mjs --selfcheck

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

/** Walk the nested suites tree and collect every spec that did not pass. */
export function failures(report) {
  const out = []
  const walk = (suite, path) => {
    const p = suite.title ? [...path, suite.title] : path
    for (const spec of suite.specs ?? []) {
      if (!spec.ok)
        out.push([...p, spec.title].join(' › '))
    }
    for (const child of suite.suites ?? []) walk(child, p)
  }
  for (const s of report.suites ?? []) walk(s, [])
  return out
}

export function storageBody(report, links) {
  const linkList = Object.entries(links).filter(([, u]) => u).map(([k, u]) => `<p><a href="${esc(u)}">${esc(k)}</a></p>`)
  // The publish step runs on `!cancelled()`, so it also fires when the job died
  // before Playwright wrote a report (e.g. the stack never came up). Say that,
  // rather than crashing or implying a green run.
  if (!report)
    return [`<p><strong>⚠️ NO RESULTS</strong> — the run failed before the tests produced a report.</p>`, ...linkList].join('\n')

  const s = report.stats ?? {}
  const rows = [
    ['Passed', s.expected ?? 0],
    ['Failed', s.unexpected ?? 0],
    ['Flaky', s.flaky ?? 0],
    ['Skipped', s.skipped ?? 0],
    ['Duration', `${Math.round((s.duration ?? 0) / 1000)}s`],
    ['Started', s.startTime ?? ''],
  ]
  const failed = failures(report)
  return [
    `<p><strong>${(s.unexpected ?? 0) === 0 ? '✅ PASSED' : '❌ FAILED'}</strong></p>`,
    '<table><tbody>',
    ...rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`),
    '</tbody></table>',
    failed.length ? `<h2>Failed tests</h2><ul>${failed.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '',
    ...linkList,
  ].join('\n')
}

async function main() {
  const { CONFLUENCE_BASE: base, CONFLUENCE_USER, CONFLUENCE_TOKEN, CONFLUENCE_PAGE_ID: id } = process.env
  for (const [k, v] of Object.entries({ CONFLUENCE_BASE: base, CONFLUENCE_USER, CONFLUENCE_TOKEN, CONFLUENCE_PAGE_ID: id })) {
    if (!v)
      throw new Error(`missing env ${k}`)
  }

  const file = process.argv[2] ?? 'playwright-report/results.json'
  const report = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  if (!report)
    console.warn(`no report at ${file} — publishing a "no results" summary`)
  const auth = `Basic ${Buffer.from(`${CONFLUENCE_USER}:${CONFLUENCE_TOKEN}`).toString('base64')}`
  const url = `${base.replace(/\/$/, '')}/wiki/api/v2/pages/${id}`

  const cur = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } })
  if (!cur.ok)
    throw new Error(`GET page ${cur.status}: ${await cur.text()}`)
  const page = await cur.json()

  const run = process.env.GITHUB_RUN_ID
    && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const body = storageBody(report, { 'CI run': run, 'HTML report': process.env.REPORT_URL })

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      status: 'current',
      title: page.title,
      body: { representation: 'storage', value: body },
      version: { number: page.version.number + 1, message: `E2E run ${process.env.GITHUB_RUN_ID ?? 'local'}` },
    }),
  })
  if (!res.ok)
    throw new Error(`PUT page ${res.status}: ${await res.text()}`)
  console.log(`Published to ${base}/wiki/pages/viewpage.action?pageId=${id}`)
}

if (process.argv[2] === '--selfcheck') {
  const r = {
    stats: { expected: 2, unexpected: 1, flaky: 0, skipped: 0, duration: 12000, startTime: 'T' },
    suites: [{ title: 'a.feature', specs: [{ title: 'ok', ok: true }], suites: [{ title: 'grp', specs: [{ title: 'b<ad>', ok: false }] }] }],
  }
  assert.deepEqual(failures(r), ['a.feature › grp › b<ad>'])
  const html = storageBody(r, { 'CI run': 'http://x' })
  assert.match(html, /❌ FAILED/)
  assert.match(html, /b&lt;ad&gt;/) // escaped, no raw markup injection
  assert.match(html, /<a href="http:\/\/x">CI run<\/a>/)
  assert.deepEqual(failures({}), [])
  const none = storageBody(null, { 'CI run': 'http://x', 'HTML report': '' })
  assert.match(none, /NO RESULTS/)
  assert.match(none, /<a href="http:\/\/x">CI run<\/a>/) // links survive the no-report path
  assert.doesNotMatch(none, /HTML report/) // empty links dropped
  console.log('selfcheck ok')
}
else {
  await main()
}
