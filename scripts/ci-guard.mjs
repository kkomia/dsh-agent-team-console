#!/usr/bin/env node
/**
 * Manifest guard for the dsh-agent-team-console DSH plugin.
 *
 * The package has zero dependencies and no build step, so there is nothing for
 * npm to verify. What can silently break a release is the DSH manifest wiring:
 * if package.json, cordis.patch.yml, client.js or the locale dictionaries stop
 * pointing at each other, the code still parses and the unit tests still pass,
 * but the Harness can no longer load the plugin.
 *
 * This script checks those cross-file invariants with built-in Node only:
 *
 *   node scripts/ci-guard.mjs
 *
 * Exit code 0 = every check passed, 1 = at least one check failed.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const failures = []
let checked = 0

/** Record one PASS/FAIL line; failed labels are replayed in the summary. */
function check(ok, label) {
  checked += 1
  console.log(`${ok ? 'ok' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

/** Read one repo-relative file as UTF-8; a missing file is a recorded failure. */
function readText(relativePath) {
  const absolutePath = join(ROOT, relativePath)
  if (!existsSync(absolutePath)) {
    check(false, `${relativePath} exists`)
    return null
  }
  return readFileSync(absolutePath, 'utf8')
}

/** Parse one repo-relative JSON file; returns null (and records a failure) when unreadable. */
function readJson(relativePath) {
  const text = readText(relativePath)
  if (text === null) return null
  try {
    const value = JSON.parse(text)
    check(true, `${relativePath} is valid JSON`)
    return value
  } catch (error) {
    check(false, `${relativePath} is valid JSON (${error.message})`)
    return null
  }
}

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.length > 0

// ---------------------------------------------------------------------------
// package.json: the DSH manifest fields the Harness reads at install time
// ---------------------------------------------------------------------------

const pkg = readJson('package.json')
if (pkg !== null) {
  const dsh = isRecord(pkg.dsh) ? pkg.dsh : {}
  const bundle = isRecord(dsh.bundle) ? dsh.bundle : {}
  const client = isRecord(dsh.client) ? dsh.client : {}
  const pkgExports = isRecord(pkg.exports) ? pkg.exports : {}
  const engines = isRecord(pkg.engines) ? pkg.engines : {}

  check(pkg.name === 'dsh-agent-team-console', 'package.json name is dsh-agent-team-console')
  check(bundle.patch === './cordis.patch.yml', "package.json dsh.bundle.patch is './cordis.patch.yml'")
  check(client.platform === 'web', "package.json dsh.client.platform is 'web'")
  check(client.immediately === true, 'package.json dsh.client.immediately is true')
  check(
    Array.isArray(client.inject) && client.inject.includes('@deepseek-ai/dsh-client-locale'),
    'package.json dsh.client.inject includes @deepseek-ai/dsh-client-locale',
  )
  check(pkgExports['./client'] === './client.js', "package.json exports['./client'] is './client.js'")
  check(isText(pkg.icon), 'package.json top-level icon is a non-empty string')
  if (isText(pkg.icon)) check(existsSync(join(ROOT, pkg.icon)), `icon file ${pkg.icon} exists`)
  check(engines.dsh === '>=0.2.1-rc.2 <0.3.0-0', "package.json engines.dsh is '>=0.2.1-rc.2 <0.3.0-0'")

  // A registry install ships only what `files` covers; missing one silently
  // breaks loading even though the repo itself is complete.
  const files = Array.isArray(pkg.files) ? pkg.files.filter(isText) : []
  const coveredByFiles = (relativePath) =>
    files.some((entry) => {
      if (entry.endsWith('/')) return relativePath.startsWith(entry)
      if (entry.includes('*')) {
        const pattern = new RegExp(
          `^${entry.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`,
        )
        return pattern.test(relativePath)
      }
      return entry === relativePath
    })
  for (const runtimeFile of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
    check(coveredByFiles(runtimeFile), `package.json files covers ${runtimeFile}`)
  }
}

// ---------------------------------------------------------------------------
// client.js: the self-registering browser bundle
// ---------------------------------------------------------------------------

const clientSource = readText('client.js')
if (clientSource !== null) {
  check(/id:\s*['"]dsh-agent-team-console['"]/.test(clientSource), "client.js registers id 'dsh-agent-team-console'")
  check(!/require\(\s*['"]@deepseek-ai\//.test(clientSource), 'client.js does not require any @deepseek-ai/ module')
}

// ---------------------------------------------------------------------------
// locale dictionaries: what the Client locale service displays
// ---------------------------------------------------------------------------

for (const language of ['zh', 'en']) {
  const relativePath = `locale/${language}.json`
  const dictionary = readJson(relativePath)
  if (dictionary === null) continue
  const meta = isRecord(dictionary.meta) ? dictionary.meta : {}
  check(isText(meta.title), `${relativePath} meta.title is a non-empty string`)
  check(isText(meta.description), `${relativePath} meta.description is a non-empty string`)
}

// ---------------------------------------------------------------------------
// cordis.patch.yml: the bundle patch entry the Host loader applies
// ---------------------------------------------------------------------------

const patch = readText('cordis.patch.yml')
if (patch !== null) {
  const lines = patch.split('\n').map((line) => line.replace(/\r$/, ''))
  const trimmed = lines.map((line) => line.trim())
  const entryText = trimmed.map((line) => line.replace(/^-\s+/, ''))
  check(trimmed[0]?.startsWith('-') === true, 'cordis.patch.yml is a YAML list')
  check(entryText.includes('insert:'), 'cordis.patch.yml declares insert:')
  check(
    entryText.filter((line) => line === 'id: agent-team-console').length === 1,
    'cordis.patch.yml declares exactly one id: agent-team-console',
  )
  check(
    entryText.filter((line) => line === 'name: dsh-agent-team-console').length === 1,
    'cordis.patch.yml declares exactly one name: dsh-agent-team-console',
  )
}

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${checked} manifest check(s) failed:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`\nAll ${checked} manifest checks passed.`)
