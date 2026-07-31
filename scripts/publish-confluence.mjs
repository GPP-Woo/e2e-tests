#!/usr/bin/env node
// Publishes a Playwright run summary to a single (fixed) Confluence page.
// Env: CONFLUENCE_BASE (https://your.atlassian.net), CONFLUENCE_USER (email),
//      CONFLUENCE_TOKEN (API token), CONFLUENCE_PAGE_ID,
//      REPORT_URL (optional, defaults to the repo's GitHub Pages site).
// Usage: node scripts/publish-confluence.mjs playwright-report/results.json
// Self-check: node scripts/publish-confluence.mjs --selfcheck

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const ICON = { expected: '✅', unexpected: '⛔', flaky: '⚠️', skipped: '⏭️' }
// Worst-wins: a scenario that fails in one browser is a failing scenario.
const RANK = { skipped: 0, expected: 1, flaky: 2, unexpected: 3 }

/**
 * Flatten the nested suites tree into one row per scenario (a `spec`), with the
 * status aggregated over its per-browser runs (a `test` per Playwright project).
 */
export function scenarios(report) {
  const out = []
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      const tests = spec.tests ?? []
      const status = tests.reduce((worst, t) => RANK[t.status] > RANK[worst] ? t.status : worst, 'skipped')
      // 3 browsers × ~300 scenarios is unreadable, so only name the browsers
      // when they disagree — that is the only case where the detail matters.
      const mixed = tests.some(t => t.status !== status)
      out.push({
        file: spec.file,
        title: [...path, spec.title].join(' › '),
        id: spec.id,
        status,
        note: mixed ? tests.filter(t => t.status === status).map(t => t.projectName).join(', ') : '',
      })
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title])
  }
  for (const s of report.suites ?? []) walk(s, [])
  return out
}

/** Every scenario that did not pass, as a plain `file › suite › scenario` string. */
export function failures(report) {
  return scenarios(report).filter(s => s.status === 'unexpected').map(s => `${s.file} › ${s.title}`)
}

/** Per-scenario deep link into the published Playwright HTML report. */
function testLink(reportUrl, s) {
  return reportUrl
    ? `<a href="${esc(`${reportUrl.replace(/\/$/, '')}/#?testId=${s.id}`)}">${esc(s.title)}</a>`
    : esc(s.title)
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
  const all = scenarios(report)
  const failed = all.filter(x => x.status === 'unexpected')
  const reportUrl = links['HTML report']

  const byFile = new Map()
  for (const x of all) byFile.set(x.file, [...(byFile.get(x.file) ?? []), x])

  return [
    `<p><strong>${(s.unexpected ?? 0) === 0 ? '✅ PASSED' : '❌ FAILED'}</strong></p>`,
    '<table><tbody>',
    ...rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`),
    '</tbody></table>',
    ...linkList,
    failed.length
      ? `<h2>Failed scenarios</h2><ul>${failed.map(x => `<li>⛔ ${testLink(reportUrl, x)} <em>${esc(x.file)}</em></li>`).join('')}</ul>`
      : '',
    '<h2>All scenarios</h2>',
    `<p>${esc(`${ICON.expected} passed · ${ICON.unexpected} failed · ${ICON.flaky} flaky · ${ICON.skipped} skipped (@todo or browser-excluded)`)}</p>`,
    ...[...byFile].flatMap(([file, list]) => [
      `<h3>${esc(file)}</h3>`,
      '<table><tbody>',
      ...list.map(x => `<tr><td>${ICON[x.status]}</td><td>${testLink(reportUrl, x)}</td><td>${esc(x.note)}</td></tr>`),
      '</tbody></table>',
    ]),
  ].filter(Boolean).join('\n')
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
  // No REPORT_URL -> scenario titles render as plain text. Deliberate: guessing
  // the Pages URL would deep-link every scenario at a 404 (Pages is off on this
  // repo — private repo on a free org plan), which reads as a broken report.
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
    suites: [{
      title: 'a.feature.spec.js',
      specs: [{ title: 'top', id: 'idtop', file: 'a.feature.spec.js', tests: [{ status: 'expected', projectName: 'chromium' }] }],
      suites: [{
        title: 'Feature: grp',
        specs: [
          // fails in webkit only -> worst-wins + the browser gets named
          { title: 'b<ad>', id: 'idbad', file: 'a.feature.spec.js', tests: [{ status: 'expected', projectName: 'chromium' }, { status: 'unexpected', projectName: 'webkit' }] },
          { title: 'todo', id: 'idtodo', file: 'a.feature.spec.js', tests: [{ status: 'skipped', projectName: 'chromium' }] },
        ],
      }],
    }],
  }
  assert.deepEqual(failures(r), ['a.feature.spec.js › Feature: grp › b<ad>'])
  assert.deepEqual(scenarios(r).map(s => `${s.status}:${s.note}`), ['expected:', 'unexpected:webkit', 'skipped:'])
  const html = storageBody(r, { 'CI run': 'http://x', 'HTML report': 'https://o.github.io/e2e/' })
  assert.match(html, /❌ FAILED/)
  assert.match(html, /b&lt;ad&gt;/) // escaped, no raw markup injection
  assert.match(html, /<a href="http:\/\/x">CI run<\/a>/)
  assert.match(html, /href="https:\/\/o\.github\.io\/e2e\/#\?testId=idbad"/) // per-scenario deep link
  assert.match(html, /⏭️<\/td><td><a[^>]*>Feature: grp › todo</) // skipped scenarios are listed too
  assert.deepEqual(failures({}), [])
  // no report URL -> plain titles, no dangling links
  assert.match(storageBody(r, { 'CI run': 'http://x' }), /<td>Feature: grp › todo<\/td>/)
  const none = storageBody(null, { 'CI run': 'http://x', 'HTML report': '' })
  assert.match(none, /NO RESULTS/)
  assert.match(none, /<a href="http:\/\/x">CI run<\/a>/) // links survive the no-report path
  assert.doesNotMatch(none, /HTML report/) // empty links dropped
  console.log('selfcheck ok')
}
else {
  await main()
}
