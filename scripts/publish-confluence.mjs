#!/usr/bin/env node
// Publishes a Playwright run summary to a single (fixed) Confluence page.
// Env: CONFLUENCE_BASE (https://your.atlassian.net), CONFLUENCE_USER (email),
//      CONFLUENCE_TOKEN (API token), CONFLUENCE_PAGE_ID,
//      REPORT_URL (optional, defaults to the repo's GitHub Pages site).
// Usage: node scripts/publish-confluence.mjs playwright-report/results.json
// Self-check: node scripts/publish-confluence.mjs --selfcheck

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { IdGenerator } from '@cucumber/messages'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const nl2br = s => esc(s).replace(/\n/g, '<br/>')

const ICON = { expected: '✅', unexpected: '⛔', flaky: '⚠️', skipped: '⏭️' }
const LABEL = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' }
// Worst-wins: a scenario that fails in one browser is a failing scenario.
const RANK = { skipped: 0, expected: 1, flaky: 2, unexpected: 3 }

const steps = s => [`${s.keyword.trim()}:${s.name ? ` ${s.name}` : ''}`, ...s.steps.map(st => `  ${st.keyword}${st.text}`)]

/**
 * Index the .feature sources by "<path relative to root>::<scenario name>", so
 * the report rows can show the Gherkin that was actually run. Background steps
 * are prepended — they are part of what the scenario asserts.
 * Returns an empty index when the sources aren't next to the report.
 */
export function gherkinIndex(root = 'bdd') {
  const out = new Map()
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory())
        walk(p)
      else if (e.name.endsWith('.feature'))
        files.push(p)
    }
  }
  try {
    walk(root)
  }
  catch {
    return out
  }
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())
  for (const f of files) {
    const doc = parser.parse(readFileSync(f, 'utf8'))
    const rel = relative(root, f)
    const background = []
    for (const c of doc.feature?.children ?? []) {
      if (c.background)
        background.push(...steps(c.background))
      if (c.scenario)
        out.set(`${rel}::${c.scenario.name}`, [...background, ...steps(c.scenario)].join('\n'))
    }
  }
  return out
}

/** Turn `Edit the <field> of X` into a regex that matches `Edit the foo of X`. */
function outlinePattern(name) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/<[^>]+>/g, '(.+)')}$`)
}

/**
 * `@a/b.feature.spec.js` + scenario title -> the Gherkin source of that scenario.
 * playwright-bdd puts Scenario Outline names on a parent suite and substitutes
 * example values into the leaf title (`Edit the <field>…` → `Edit the foo…`),
 * so we also try path segments and placeholder patterns.
 */
function gherkinFor(index, file, title, fullTitle = title) {
  const fileKey = file.replace(/\.spec\.js$/, '')
  const names = [title, ...fullTitle.split(' › ')].filter(Boolean)
  for (const name of names) {
    const hit = index.get(`${fileKey}::${name}`)
    if (hit)
      return bindOutline(hit, name, title)
  }
  for (const [k, v] of index) {
    if (!k.startsWith(`${fileKey}::`) || !k.includes('<'))
      continue
    const outlineName = k.slice(fileKey.length + 2)
    if (outlinePattern(outlineName).test(title))
      return bindOutline(v, outlineName, title)
  }
  return ''
}

/** Fill `<param>` placeholders in outline Gherkin from the example title. */
function bindOutline(gherkin, outlineName, exampleTitle) {
  const params = [...outlineName.matchAll(/<([^>]+)>/g)].map(m => m[1])
  if (!params.length)
    return gherkin
  const m = exampleTitle.match(outlinePattern(outlineName))
  if (!m)
    return gherkin
  let out = gherkin.replace(/^Scenario Outline:/, 'Scenario:')
  params.forEach((p, i) => {
    out = out.replaceAll(`<${p}>`, m[i + 1])
  })
  return out
}

/** Unique `test.skip(reason)` / `test.fix(reason)` descriptions from skipped runs. */
function skipReason(tests) {
  const reasons = []
  for (const t of tests) {
    if (t.status !== 'skipped')
      continue
    const anns = [
      ...(t.annotations ?? []),
      ...(t.results ?? []).flatMap(r => r.annotations ?? []),
    ]
    for (const a of anns) {
      if ((a.type === 'skip' || a.type === 'fix') && a.description)
        reasons.push(a.description)
    }
  }
  return [...new Set(reasons)].join('; ')
}

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
        scenario: spec.title,
        title: [...path, spec.title].join(' › '),
        id: spec.id,
        status,
        note: mixed ? tests.filter(t => t.status === status).map(t => t.projectName).join(', ') : '',
        reason: status === 'skipped' ? skipReason(tests) : '',
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
function testLink(reportUrl, s, text) {
  return reportUrl
    ? `<a href="${esc(`${reportUrl.replace(/\/$/, '')}/#?testId=${s.id}`)}">${esc(text)}</a>`
    : esc(text)
}

export function storageBody(report, links, gherkin = new Map()) {
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

  const row = (x) => {
    const status = `${ICON[x.status]} - ${esc(LABEL[x.status])}${x.note ? ` (${esc(x.note)})` : ''}${
      x.reason ? `<br/>${esc(x.reason)}` : ''}`
    const meta = `${status}<br/><br/>${testLink(reportUrl, x, 'report')}<br/><br/>${esc(x.title)}`
    return `<tr><td>${meta}</td><td>${nl2br(gherkinFor(gherkin, x.file, x.scenario, x.title))}</td></tr>`
  }

  return [
    `<p><strong>${(s.unexpected ?? 0) === 0 ? '✅ PASSED' : '❌ FAILED'}</strong></p>`,
    '<table><tbody>',
    ...rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`),
    '</tbody></table>',
    ...linkList,
    failed.length
      ? `<h2>Failed scenarios</h2><ul>${failed.map(x => `<li>⛔ ${testLink(reportUrl, x, x.title)} <em>${esc(x.file)}</em></li>`).join('')}</ul>`
      : '',
    '<h2>All scenarios</h2>',
    `<p>${esc(`${ICON.expected} passed · ${ICON.unexpected} failed · ${ICON.flaky} flaky · ${ICON.skipped} skipped (@todo or browser-excluded)`)}</p>`,
    ...[...byFile].flatMap(([file, list]) => [
      `<h3>${esc(file)}</h3>`,
      // full-width breaks the table out of the page's fixed content column
      '<table data-layout="full-width"><tbody>',
      '<tr><th>Test</th><th>Gherkin</th></tr>',
      ...list.map(row),
      '</tbody></table>',
    ]),
  ].filter(Boolean).join('\n')
}

/** Pages serves one site per repo at <owner>.github.io/<repo>/ — derive it. */
function defaultReportUrl() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
  return owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : ''
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
  const body = storageBody(
    report,
    { 'CI run': run, 'HTML report': process.env.REPORT_URL || defaultReportUrl() },
    gherkinIndex(),
  )

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
          {
            title: 'todo',
            id: 'idtodo',
            file: 'a.feature.spec.js',
            tests: [{
              status: 'skipped',
              projectName: 'chromium',
              annotations: [{ type: 'skip', description: 'TODO: step implementation pending (@todo)' }],
            }],
          },
        ],
      }],
    }],
  }
  assert.deepEqual(failures(r), ['a.feature.spec.js › Feature: grp › b<ad>'])
  assert.deepEqual(
    scenarios(r).map(s => `${s.status}:${s.note}:${s.reason}`),
    ['expected::', 'unexpected:webkit:', 'skipped::TODO: step implementation pending (@todo)'],
  )

  // The real index is built from disk; this repo's own features must parse.
  const real = gherkinIndex('bdd')
  assert.ok(real.size > 0, 'bdd/*.feature should parse')
  const [, sample] = [...real].find(([k]) => k.endsWith('::Welkomsttekst wijzigen'))
  assert.match(sample, /^Background:\n {2}Given /) // background steps lead
  assert.match(sample, /Scenario: Welkomsttekst wijzigen\n {2}When /)

  const gk = new Map([['a.feature::b<ad>', 'Scenario: b<ad>\n  Given x']])
  const html = storageBody(r, { 'CI run': 'http://x', 'HTML report': 'https://o.github.io/e2e/' }, gk)
  assert.match(html, /❌ FAILED/)
  assert.match(html, /<table data-layout="full-width">/) // tables span the full page width
  assert.match(html, /<th>Test<\/th><th>Gherkin<\/th><\/tr>/)
  // status, blank line, report link, blank line, path — then Gherkin in column 2
  assert.match(html, /<td>⛔ - failed \(webkit\)<br\/><br\/><a href="https:\/\/o\.github\.io\/e2e\/#\?testId=idbad">report<\/a><br\/><br\/>Feature: grp › b&lt;ad&gt;<\/td><td>Scenario: b&lt;ad&gt;<br\/> {2}Given x<\/td>/)
  // skip reason sits under the status; no gherkin source -> empty cell, row still rendered
  assert.match(html, /⏭️ - skipped<br\/>TODO: step implementation pending \(@todo\)<br\/><br\/>/)
  assert.match(html, /idtodo">report<\/a><br\/><br\/>Feature: grp › todo<\/td><td><\/td>/)
  assert.match(html, /<a href="http:\/\/x">CI run<\/a>/)

  // Scenario Outline: leaf title has values; outline name lives on the parent suite.
  const outline = new Map([['o.feature::Edit the <field> of X', 'Scenario Outline: Edit the <field> of X\n  When I change "<field>"']])
  const or = {
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 1, startTime: 'T' },
    suites: [{
      title: 'o.feature.spec.js',
      suites: [{
        title: 'Edit the <field> of X',
        specs: [{
          title: 'Edit the foo of X',
          id: 'ido',
          file: 'o.feature.spec.js',
          tests: [{ status: 'expected', projectName: 'chromium' }],
        }],
      }],
    }],
  }
  const oh = storageBody(or, { 'HTML report': 'https://o/' }, outline)
  assert.match(oh, /Scenario: Edit the foo of X<br\/> {2}When I change &quot;foo&quot;/) // placeholders bound, escaped

  assert.deepEqual(failures({}), [])
  assert.equal(gherkinIndex('does-not-exist').size, 0) // missing sources must not crash the publish
  const none = storageBody(null, { 'CI run': 'http://x', 'HTML report': '' })
  assert.match(none, /NO RESULTS/)
  assert.match(none, /<a href="http:\/\/x">CI run<\/a>/) // links survive the no-report path
  assert.doesNotMatch(none, /HTML report/) // empty links dropped
  console.log('selfcheck ok')
}
else {
  await main()
}
