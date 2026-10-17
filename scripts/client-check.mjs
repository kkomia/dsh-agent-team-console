#!/usr/bin/env node
/**
 * Client layout guard for the dsh-agent-team-console browser bundle.
 *
 * client.js keeps its pure top-down geometry (UI spec v1.4 section A1) inside a
 * self-contained block between the two marker comments `@atc-layout-begin` and
 * `@atc-layout-end`. The block must not reference the surrounding closure, so
 * this script extracts it by its markers, evaluates it in Node with
 * `new Function`, and asserts the frozen layout and edge contract against the
 * spec. It also checks the static wiring around the block: AgentGraph calls the
 * pure functions, the `atc-lead-flow` keyframes exist and respect
 * `prefers-reduced-motion`, and no ring-layout remnants survive.
 *
 *   node scripts/client-check.mjs
 *
 * Exit code 0 = every check passed, 1 = at least one check failed.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_PATH = join(ROOT, 'client.js')
const clientSource = readFileSync(CLIENT_PATH, 'utf8')

const BEGIN_MARKER = '/* @atc-layout-begin */'
const END_MARKER = '/* @atc-layout-end */'

const EXPECTED_LAYOUT = {
  padX: 108,
  padTop: 56,
  padBottom: 92,
  minWidth: 380,
  slotX: 108,
  rowGap: 132,
  singleRowMax: 5,
  leadY: 96,
  overflowRadius: 21,
}

const failures = []
let checked = 0

/** Record one PASS/FAIL line; failed labels are replayed in the summary. */
function check(label, assertion) {
  checked += 1
  try {
    assertion()
    console.log(`ok   ${label}`)
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    console.log(`FAIL ${label}`)
    failures.push(`${label}: ${message}`)
  }
}

/** Finish the run: summary plus a non-zero exit code when anything failed. */
function finish() {
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${checked} client layout check(s) failed:`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log(`\nAll ${checked} client layout checks passed.`)
  process.exit(0)
}

/** Count non-overlapping occurrences of a plain string. */
function countOccurrences(text, needle) {
  let count = 0
  let offset = 0
  for (;;) {
    const at = text.indexOf(needle, offset)
    if (at < 0) return count
    count += 1
    offset = at + needle.length
  }
}

/**
 * Slice out the pure layout block. The markers are block comments, so a raw
 * capture can keep the tail of the opening comment and the head of the closing
 * one; strip those leftovers before evaluation.
 */
function extractLayoutBlock(text) {
  const begin = text.indexOf(BEGIN_MARKER)
  const end = text.indexOf(END_MARKER, begin + BEGIN_MARKER.length)
  if (begin < 0 || end < 0) return null
  return text
    .slice(begin + BEGIN_MARKER.length, end)
    .replace(/^\s*\*\/[\r\n]*/, '')
    .replace(/\/\*\s*$/, '')
}

/** Slice one indented `function Name(...)` declaration up to the next one. */
function functionSource(text, name) {
  const marker = 'function ' + name + '('
  const start = text.indexOf(marker)
  if (start < 0) return null
  const next = text.indexOf('\n    function ', start + marker.length)
  return next < 0 ? text.slice(start) : text.slice(start, next)
}

// ---------------------------------------------------------------------------
// extraction + evaluation of the pure block
// ---------------------------------------------------------------------------

const layoutBlock = extractLayoutBlock(clientSource)

check('layout block markers appear exactly once each', () => {
  assert.equal(countOccurrences(clientSource, BEGIN_MARKER), 1)
  assert.equal(countOccurrences(clientSource, END_MARKER), 1)
  assert.ok(layoutBlock !== null, 'markers must be present in begin-then-end order')
})

check('layout block is non-empty standalone JavaScript', () => {
  assert.ok(layoutBlock !== null, 'layout block could not be extracted')
  assert.ok(layoutBlock.trim().length > 200, 'captured block is suspiciously small')
  assert.doesNotMatch(layoutBlock, /require\s*\(|window\.|__ModuleLoader__/, 'block must not reference the outer bundle')
})

if (layoutBlock === null) finish()

let layoutApi = null
check('layout block evaluates through new Function', () => {
  layoutApi = new Function(layoutBlock + '\nreturn { LAYOUT, layoutTopDown, edgePath }')()
  assert.equal(typeof layoutApi.LAYOUT, 'object', 'LAYOUT must be defined')
  assert.equal(typeof layoutApi.layoutTopDown, 'function', 'layoutTopDown must be defined')
  assert.equal(typeof layoutApi.edgePath, 'function', 'edgePath must be defined')
})

if (layoutApi === null) finish()

const { LAYOUT, layoutTopDown, edgePath } = layoutApi

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const makeNode = (index) => ({ key: 'n' + index, isLead: index === 0, radius: index === 0 ? 30 : 26 })
const makeNodes = (count) => Array.from({ length: count }, (_, index) => makeNode(index))

/** Group the placed teammate positions into rows (top to bottom, x sorted). */
function teammateRows(layout, nodes) {
  const rows = []
  for (const node of nodes.slice(1)) {
    const position = layout.positions[node.key]
    if (!position) continue
    let row = rows.find((candidate) => candidate.y === position.y)
    if (!row) {
      row = { y: position.y, xs: [] }
      rows.push(row)
    }
    row.xs.push(position.x)
  }
  rows.sort((left, right) => left.y - right.y)
  for (const row of rows) row.xs.sort((left, right) => left - right)
  return rows
}

/** Spec rule 2: teammate counts (overflow slot included) to balanced row sizes. */
function specRowSizes(teammateCount) {
  if (teammateCount === 0) return []
  if (teammateCount <= LAYOUT.singleRowMax) return [teammateCount]
  const firstRow = Math.ceil(teammateCount / 2)
  return [firstRow, teammateCount - firstRow]
}

/** Spec rules 3/4/5/6/7 implemented independently as the expected layout. */
function specLayout(nodes, hasOverflow) {
  const list = Array.isArray(nodes) ? nodes : []
  const rest = list.slice(1)
  const restCount = rest.length + (hasOverflow ? 1 : 0)
  const rowSizes = specRowSizes(restCount)
  const maxCols = rowSizes.length > 0 ? rowSizes[0] : 0
  const width = Math.max(LAYOUT.minWidth, (maxCols - 1) * LAYOUT.slotX + 2 * LAYOUT.padX)
  const leadKey = list.length > 0 && list[0].key !== undefined && list[0].key !== null ? String(list[0].key) : ''
  const positions = {}
  if (list.length > 0) positions[leadKey] = { x: width / 2, y: LAYOUT.leadY }
  let overflow = null
  let cursor = 0
  for (let rowIndex = 0; rowIndex < rowSizes.length; rowIndex += 1) {
    const count = rowSizes[rowIndex]
    const equalRows = rowSizes.length === 2 && rowSizes[0] === rowSizes[1]
    const rowShift = rowIndex === 1 && equalRows ? LAYOUT.slotX / 2 : 0
    const start = (width - (count - 1) * LAYOUT.slotX) / 2 + rowShift
    const y = LAYOUT.leadY + (rowIndex + 1) * LAYOUT.rowGap
    for (let column = 0; column < count; column += 1) {
      const lastSlot = rowIndex === rowSizes.length - 1 && column === count - 1
      if (hasOverflow && lastSlot) {
        overflow = { x: start + column * LAYOUT.slotX, y }
        continue
      }
      const node = rest[cursor]
      cursor += 1
      if (!node) continue
      const key = node.key !== undefined && node.key !== null ? String(node.key) : 'node-' + cursor
      positions[key] = { x: start + column * LAYOUT.slotX, y }
    }
  }
  return {
    width,
    height: LAYOUT.leadY + rowSizes.length * LAYOUT.rowGap + LAYOUT.padBottom,
    positions,
    lead: { key: leadKey, x: width / 2, y: LAYOUT.leadY },
    overflow,
    rows: rowSizes.length,
  }
}

/** Every emitted coordinate must be a finite number in a positive viewBox. */
function assertFiniteLayout(layout) {
  assert.ok(Number.isFinite(layout.width) && layout.width > 0, 'width must be finite and positive')
  assert.ok(Number.isFinite(layout.height) && layout.height > 0, 'height must be finite and positive')
  assert.ok(layout.width >= LAYOUT.minWidth, 'width must not drop below minWidth')
  assert.ok(Number.isFinite(layout.lead.x) && Number.isFinite(layout.lead.y), 'lead position must be finite')
  for (const [key, position] of Object.entries(layout.positions)) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y), `position ${key} must be finite`)
  }
  if (layout.overflow !== null) {
    assert.ok(Number.isFinite(layout.overflow.x) && Number.isFinite(layout.overflow.y), 'overflow position must be finite')
  }
}

const pathCommands = (path) => path.match(/[MLCQ]/g) || []
const pathNumbers = (path) => (path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)

// ---------------------------------------------------------------------------
// frozen constants
// ---------------------------------------------------------------------------

check('LAYOUT matches the frozen v1.4 values', () => {
  assert.deepEqual(LAYOUT, EXPECTED_LAYOUT)
})

// ---------------------------------------------------------------------------
// root / single row
// ---------------------------------------------------------------------------

check('layout: root-only input keeps 0 teammate rows and a centred Lead', () => {
  const layout = layoutTopDown(makeNodes(1), false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 0)
  assert.equal(layout.width, LAYOUT.minWidth)
  assert.equal(layout.height, LAYOUT.leadY + LAYOUT.padBottom)
  assert.equal(layout.lead.key, 'n0')
  assert.equal(layout.lead.x, layout.width / 2)
  assert.equal(layout.lead.y, LAYOUT.leadY)
  assert.deepEqual(layout.positions.n0, { x: layout.width / 2, y: LAYOUT.leadY })
  assert.equal(layout.overflow, null)
})

check('layout: empty input returns finite numbers without throwing', () => {
  const layout = layoutTopDown([], false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 0)
  assert.deepEqual(layout.positions, {})
  assert.equal(layout.width, LAYOUT.minWidth)
  assert.equal(layout.height, LAYOUT.leadY + LAYOUT.padBottom)
  assert.equal(layout.lead.x, layout.width / 2)
  assert.equal(layout.lead.y, LAYOUT.leadY)
})

check('layout: 5 teammates stay in one centred row', () => {
  const nodes = makeNodes(6)
  const layout = layoutTopDown(nodes, false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 1)
  const rows = teammateRows(layout, nodes)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].xs.length, 5)
  assert.equal(layout.width, (5 - 1) * LAYOUT.slotX + 2 * LAYOUT.padX)
  assert.equal(layout.height, LAYOUT.leadY + LAYOUT.rowGap + LAYOUT.padBottom)
  assert.deepEqual(rows[0].xs, [108, 216, 324, 432, 540])
  assert.equal(rows[0].y, LAYOUT.leadY + LAYOUT.rowGap)
  assert.equal((rows[0].xs[0] + rows[0].xs[rows[0].xs.length - 1]) / 2, layout.width / 2)
})

check('layout: singleRowMax boundary is 5 teammates -> 1 row, 6 -> 2 rows', () => {
  assert.equal(layoutTopDown(makeNodes(6), false).rows, 1)
  assert.equal(layoutTopDown(makeNodes(7), false).rows, 2)
})

// ---------------------------------------------------------------------------
// balanced two-row splits (v1.4 amendment: equal rows shift the second row)
// ---------------------------------------------------------------------------

check('layout: balanced 6 teammates -> 3+3, second row shifted by slotX / 2', () => {
  const nodes = makeNodes(7)
  const layout = layoutTopDown(nodes, false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 2)
  assert.equal(layout.width, 432)
  assert.equal(layout.height, LAYOUT.leadY + 2 * LAYOUT.rowGap + LAYOUT.padBottom)
  const rows = teammateRows(layout, nodes)
  assert.deepEqual(rows.map((row) => row.xs.length), [3, 3])
  assert.deepEqual(rows[0].xs, [108, 216, 324])
  assert.deepEqual(rows[1].xs, [162, 270, 378])
  assert.deepEqual(rows.map((row) => row.y), [LAYOUT.leadY + LAYOUT.rowGap, LAYOUT.leadY + 2 * LAYOUT.rowGap])
  for (let column = 0; column < 3; column += 1) {
    assert.equal(rows[1].xs[column] - rows[0].xs[column], LAYOUT.slotX / 2)
  }
})

check('layout: balanced 7 teammates -> 4+3, different-length rows stay centred', () => {
  const nodes = makeNodes(8)
  const layout = layoutTopDown(nodes, false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 2)
  assert.equal(layout.width, 540)
  const rows = teammateRows(layout, nodes)
  assert.deepEqual(rows.map((row) => row.xs.length), [4, 3])
  assert.deepEqual(rows[0].xs, [108, 216, 324, 432])
  assert.deepEqual(rows[1].xs, [162, 270, 378])
  for (const row of rows) {
    assert.equal((row.xs[0] + row.xs[row.xs.length - 1]) / 2, layout.width / 2, 'row must stay centred')
  }
})

check('layout: balanced 8 teammates -> 4+4, second row shifted by slotX / 2', () => {
  const nodes = makeNodes(9)
  const layout = layoutTopDown(nodes, false)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 2)
  assert.equal(layout.width, 540)
  const rows = teammateRows(layout, nodes)
  assert.deepEqual(rows.map((row) => row.xs.length), [4, 4])
  assert.deepEqual(rows[0].xs, [108, 216, 324, 432])
  assert.deepEqual(rows[1].xs, [162, 270, 378, 486])
  for (let column = 0; column < 4; column += 1) {
    assert.equal(rows[1].xs[column] - rows[0].xs[column], LAYOUT.slotX / 2)
  }
  for (const x of rows[1].xs) {
    assert.ok(x >= 0 && x <= layout.width, 'shifted row must stay inside the viewBox')
  }
})

// ---------------------------------------------------------------------------
// generic invariants over many shapes, with and without the overflow slot
// ---------------------------------------------------------------------------

check('layout: generic invariants hold for 0..10 node teams with/without overflow', () => {
  for (let count = 0; count <= 10; count += 1) {
    for (const hasOverflow of [false, true]) {
      const nodes = makeNodes(count)
      const layout = layoutTopDown(nodes, hasOverflow)
      const context = ` (count=${count}, hasOverflow=${hasOverflow})`
      assertFiniteLayout(layout)
      assert.deepEqual(layout, specLayout(nodes, hasOverflow), 'layout must follow the spec rules' + context)
      assert.equal(layout.lead.x, layout.width / 2, 'Lead must be horizontally centred' + context)
      assert.equal(layout.lead.y, LAYOUT.leadY, 'Lead must sit at leadY' + context)
      assert.equal(Object.keys(layout.positions).length, count, 'one position per Lead/teammate row' + context)
      for (const position of Object.values(layout.positions)) {
        assert.ok(position.x >= 0 && position.x <= layout.width, 'node x must stay inside the viewBox' + context)
        assert.ok(position.y >= layout.lead.y, 'no node may sit above the Lead' + context)
      }
      const rows = teammateRows(layout, nodes)
      for (const row of rows) {
        assert.ok(row.y > layout.lead.y, 'teammate rows must be below the Lead' + context)
        for (let index = 1; index < row.xs.length; index += 1) {
          assert.ok(row.xs[index] - row.xs[index - 1] >= LAYOUT.slotX, 'nodes within a row are never closer than slotX' + context)
        }
      }
      for (let index = 1; index < rows.length; index += 1) {
        assert.equal(rows[index].y - rows[index - 1].y, LAYOUT.rowGap, 'rows must be rowGap apart' + context)
      }
      if (hasOverflow) {
        assert.ok(layout.overflow !== null, 'overflow slot must be returned' + context)
        const lastRowY = LAYOUT.leadY + layout.rows * LAYOUT.rowGap
        assert.equal(layout.overflow.y, lastRowY, 'overflow must sit on the last row' + context)
        const lastRow = rows[rows.length - 1]
        const expectedX = lastRow && lastRow.xs.length > 0 ? lastRow.xs[lastRow.xs.length - 1] + LAYOUT.slotX : layout.width / 2
        assert.equal(layout.overflow.x, expectedX, 'overflow must take the last slot of the last row' + context)
        for (const position of Object.values(layout.positions)) {
          assert.ok(
            !(position.x === layout.overflow.x && position.y === layout.overflow.y),
            'overflow placeholder must have no positions entry' + context,
          )
        }
      } else {
        assert.equal(layout.overflow, null, 'no overflow slot without hasOverflow' + context)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// overflow placeholder
// ---------------------------------------------------------------------------

check('layout: overflow is the last slot of the last row (4+4 case)', () => {
  const nodes = makeNodes(8)
  const layout = layoutTopDown(nodes, true)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 2)
  assert.equal(layout.width, 540)
  const rows = teammateRows(layout, nodes)
  assert.deepEqual(rows.map((row) => row.xs.length), [4, 3])
  assert.deepEqual(rows[1].xs, [162, 270, 378])
  assert.deepEqual(layout.overflow, { x: 486, y: LAYOUT.leadY + 2 * LAYOUT.rowGap })
  assert.equal(Object.keys(layout.positions).length, nodes.length)
})

check('layout: overflow after one teammate takes the second slot of a single row', () => {
  const nodes = makeNodes(2)
  const layout = layoutTopDown(nodes, true)
  assertFiniteLayout(layout)
  assert.equal(layout.rows, 1)
  assert.deepEqual(teammateRows(layout, nodes).map((row) => row.xs), [[136]])
  assert.deepEqual(layout.overflow, { x: 244, y: LAYOUT.leadY + LAYOUT.rowGap })
})

check('layout: overflow with no teammates stays finite and unplaced', () => {
  for (const nodes of [makeNodes(0), makeNodes(1)]) {
    const layout = layoutTopDown(nodes, true)
    assertFiniteLayout(layout)
    assert.equal(layout.rows, 1)
    assert.deepEqual(teammateRows(layout, nodes), [])
    assert.deepEqual(layout.overflow, { x: layout.width / 2, y: LAYOUT.leadY + LAYOUT.rowGap })
    assert.equal(Object.keys(layout.positions).length, nodes.length)
    for (const position of Object.values(layout.positions)) {
      assert.ok(!(position.x === layout.overflow.x && position.y === layout.overflow.y))
    }
  }
})

check('layout: weird inputs never throw and stay finite', () => {
  for (const nodes of [null, undefined, {}, makeNodes(0)]) {
    const layout = layoutTopDown(nodes, false)
    assertFiniteLayout(layout)
  }
  const overflowLayout = layoutTopDown(undefined, true)
  assertFiniteLayout(overflowLayout)
  assert.ok(overflowLayout.overflow !== null)
})

// ---------------------------------------------------------------------------
// edgePath
// ---------------------------------------------------------------------------

check('edgePath lead: downward edge is a cubic with control ys between the rows', () => {
  const from = { x: 190, y: LAYOUT.leadY }
  const to = { x: 298, y: LAYOUT.leadY + LAYOUT.rowGap }
  const path = edgePath(from, to, 'lead')
  assert.deepEqual(pathCommands(path), ['M', 'C'])
  const numbers = pathNumbers(path)
  assert.equal(numbers.length, 8)
  assert.ok(numbers.every(Number.isFinite), 'lead path numbers must be finite')
  assert.deepEqual([numbers[0], numbers[1], numbers[6], numbers[7]], [from.x, from.y, to.x, to.y])
  assert.ok(numbers[3] > from.y && numbers[3] < to.y, 'first control y must sit between the rows')
  assert.ok(numbers[5] > from.y && numbers[5] < to.y, 'second control y must sit between the rows')
})

check('edgePath lead: layout-derived lead edge keeps both control ys between the row ys', () => {
  const nodes = makeNodes(3)
  const layout = layoutTopDown(nodes, false)
  const target = layout.positions.n1
  const path = edgePath(layout.lead, target, 'lead')
  assert.equal(pathCommands(path)[1], 'C')
  const numbers = pathNumbers(path)
  assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y))
  assert.ok(numbers[3] > layout.lead.y && numbers[3] < target.y)
  assert.ok(numbers[5] > layout.lead.y && numbers[5] < target.y)
})

check('edgePath lead: dy <= 0 falls back to a straight line', () => {
  const flat = edgePath({ x: 100, y: 300 }, { x: 200, y: 300 }, 'lead')
  assert.deepEqual(pathCommands(flat), ['M', 'L'])
  assert.equal(pathNumbers(flat).length, 4)
  const upward = edgePath({ x: 100, y: 300 }, { x: 200, y: 200 }, 'lead')
  assert.deepEqual(pathCommands(upward), ['M', 'L'])
})

check('edgePath message: returns a finite quadratic curve', () => {
  const path = edgePath({ x: 100, y: 300 }, { x: 300, y: 400 }, 'message')
  assert.deepEqual(pathCommands(path), ['M', 'Q'])
  const numbers = pathNumbers(path)
  assert.equal(numbers.length, 6)
  assert.ok(numbers.every(Number.isFinite), 'message path numbers must be finite')
  assert.deepEqual([numbers[0], numbers[1], numbers[4], numbers[5]], [100, 300, 300, 400])
})

check('edgePath message: same-row edges bend upward in both directions', () => {
  const leftToRight = edgePath({ x: 100, y: 500 }, { x: 400, y: 500 }, 'message')
  assert.equal(pathCommands(leftToRight)[1], 'Q')
  assert.ok(pathNumbers(leftToRight)[3] < 500, 'control y must sit above both endpoints')
  const rightToLeft = edgePath({ x: 400, y: 500 }, { x: 100, y: 500 }, 'message')
  assert.ok(pathNumbers(rightToLeft)[3] < 500, 'control y must sit above both endpoints')
  const nearHorizontal = edgePath({ x: 100, y: 500 }, { x: 400, y: 510 }, 'message')
  const controlY = pathNumbers(nearHorizontal)[3]
  assert.ok(controlY < 500 && controlY < 510, 'near-horizontal edge must still bend upward')
})

check('edgePath: deterministic for identical inputs', () => {
  const from = { x: 10, y: 20 }
  const to = { x: 130, y: 152 }
  assert.equal(edgePath(from, to, 'lead'), edgePath(from, to, 'lead'))
  assert.equal(edgePath(from, to, 'message'), edgePath(from, to, 'message'))
})

// ---------------------------------------------------------------------------
// static wiring checks
// ---------------------------------------------------------------------------

check('static: atc-lead-flow keyframes exist and drive .atc-edge-lead', () => {
  assert.match(clientSource, /@keyframes\s+atc-lead-flow\s*\{/)
  assert.match(clientSource, /\.atc-edge-lead\s*\{[^}]*animation\s*:\s*atc-lead-flow/)
})

check('static: prefers-reduced-motion disables the lead dash animation', () => {
  const media = clientSource.match(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(media, 'prefers-reduced-motion media block not found')
  assert.match(media[1], /\.atc-edge-lead/)
  assert.match(media[1], /animation\s*:\s*none/)
})

check('static: no ring-layout remnants remain', () => {
  for (const remnant of ['GRAPH_MIN_RADIUS', 'atc-node-hub', 'curvedEdgePath']) {
    assert.ok(!clientSource.includes(remnant), `client.js still contains ${remnant}`)
  }
})

check('static: AgentGraph uses layoutTopDown and edgePath', () => {
  const graph = functionSource(clientSource, 'AgentGraph')
  assert.ok(graph !== null, 'AgentGraph function not found')
  assert.match(graph, /\blayoutTopDown\s*\(/)
  assert.match(graph, /\bedgePath\s*\(/)
})

finish()
