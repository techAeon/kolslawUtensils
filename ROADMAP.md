# Kolslaw Utensils — Product Development Roadmap
### Agent-Orchestrable Engineering Document · v1.0

---

## Document Purpose

This roadmap is the authoritative reference for all engineering work on the Kolslaw Utensils suite. It is written to be consumed by both human engineers and LLM coding agents. Every agent working on this codebase should read this document in full before beginning any task. It defines:

- What has already been built and its current state
- What needs to be updated or corrected in existing artifacts
- What needs to be built, in what order, and to what specification
- The contracts between shared components and individual tools
- Testing requirements for every component

**Cardinal Rules for all agents:**
1. Never touch `office-helpers.js` from within a tool package. All Word DOM interaction goes through that module.
2. Never introduce a backend dependency. Every tool must function as a static file served over HTTPS.
3. Never duplicate parsing logic in a tool package. If it involves understanding patent text, it belongs in `patent-parser.js`.
4. All functions must be pure and stateless unless they are in `office-helpers.js`.
5. All new functions must have a corresponding test in the relevant `.test.js` file before the PR is merged.

---

## Repository Structure

```
kolslaw-utensils/
├── README.md
├── package.json                        ← npm workspaces root
├── .github/
│   └── workflows/
│       └── ci.yml                      ← Run tests on PR; deploy on merge to main
├── scripts/
│   └── build.js                        ← Copies packages/*/taskpane.html + manifest.xml → deploy/
├── packages/
│   ├── shared-core/                    ← THE BRAIN. No Office.js. Pure JS only.
│   │   ├── patent-parser.js            ✅ BUILT (needs updates — see Phase 1)
│   │   ├── uspto-headings.js           ✅ BUILT (complete)
│   │   ├── office-helpers.js           🔲 NOT BUILT
│   │   ├── ui-components.js            🔲 NOT BUILT
│   │   ├── patent-parser.test.js       ✅ BUILT (needs additions — see Phase 1)
│   │   └── package.json                ✅ BUILT
│   ├── amendment-converter/            ✅ BUILT (needs shared-core integration — see Phase 2)
│   │   ├── taskpane.html
│   │   ├── manifest.xml
│   │   └── README.md
│   ├── claim-linter/                   🔲 NOT BUILT
│   ├── claim-charter/                  🔲 NOT BUILT
│   ├── pto-compliance/                 🔲 NOT BUILT
│   ├── app-generator/                  🔲 NOT BUILT
│   ├── claim-tree/                     🔲 NOT BUILT
│   ├── oa-response-shell/              🔲 NOT BUILT
│   ├── term-consistency/               🔲 NOT BUILT
│   └── part-number-manager/            🔲 NOT BUILT
└── deploy/                             ← Static files served by Netlify
    ├── index.html                      🔲 NOT BUILT (suite landing page)
    └── [tool-name]/
        ├── taskpane.html
        └── manifest.xml
```

---

## Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Add-in runtime | Office.js (WordApi 1.3+) | Required for Word integration |
| Shared logic | Vanilla ES Modules | No bundler needed for static deployment |
| Testing | Vitest | Fast, ESM-native, zero config |
| Hosting | Netlify (free tier) | HTTPS static files, no backend |
| Build | Node.js script (`scripts/build.js`) | No bundler complexity |
| CI | GitHub Actions | Free for public repos |
| Fonts | Google Fonts (IBM Plex Sans, IBM Plex Mono, Playfair Display) | Already in use |
| Visualization (Claim Tree) | D3.js v7 (CDN) | No npm install needed in taskpane |

---

## Current State of Built Artifacts

### `packages/shared-core/patent-parser.js` ✅ Built

**What it does:** Parses USPTO patent application text into structured data. Contains 10 sections covering document structure analysis, claim parsing, term extraction, antecedent basis checking, dependency graph construction, PTO compliance counting, claim format checking, § 112 issue detection, term consistency checking, and amendment markup parsing.

**Current gaps (to be fixed in Phase 1):**
- `parseDocumentStructure()` uses `APPLICATION_SECTION_PATTERNS` from `uspto-headings.js` but the import was added in a patch and needs integration testing
- `detectDocumentType()` was added but has no tests yet
- `checkAmendmentStatusIndicators()` is missing — not yet implemented
- `checkSpecificationSupport()` is missing — not yet implemented
- `cloneMethodToApparatus()` is missing — not yet implemented
- `parseOfficeAction()` is missing — not yet implemented
- The `toSingular()` function handles basic cases but misses irregular plurals common in patent claims (e.g., "matrices" → "matrix", "indices" → "index")
- `extractIntroducedTerms()` `STOPWORD_PHRASES` set needs expansion based on real claim review

**Functions exported (current):**

```
parseClaims(text) → Claim[]
parseDocumentStructure(text) → Object
extractClaimsText(text) → string
extractIntroducedTerms(text) → string[]
extractPartNumbers(text) → Array<{term, number, fullMatch}>
extractDefinedTerms(text) → string[]
checkAntecedentBasis(claims) → AntecedentIssue[]
findTheUsages(text) → Array<{term, context}>
buildDependencyGraph(claims) → DependencyGraph
buildClaimMap(claims) → Map<number,Claim>
getDependencyChain(claimNumber, graph) → number[]
countClaims(claims) → ClaimCountReport
checkClaimFormat(claims) → ClaimFormatIssue[]
check112Issues(claims) → Section112Issue[]
checkTermConsistency(claimsTerms, specText, preferredTerms?) → ConsistencyIssue[]
parseAmendmentMarkup(text) → AmendedSegment[]
runFullLint(claims) → Object
normalizeWhitespace(text) → string
escapeRegex(str) → string
classifyApplicationSection(headerText) → string|null  [re-exported from uspto-headings.js]
classifyDocumentType(headerText) → string|null         [re-exported from uspto-headings.js]
getLabelForKey(key) → string                           [re-exported from uspto-headings.js]
APPLICATION_SECTIONS                                   [re-exported from uspto-headings.js]
DOCUMENT_TYPE_PATTERNS                                 [re-exported from uspto-headings.js]
detectDocumentType(text) → string|null
```

---

### `packages/shared-core/uspto-headings.js` ✅ Built (Complete)

**What it does:** Single source of truth for all USPTO-accepted document section heading strings, sourced from the official USPTO accepted headings list. Contains two datasets:

- `APPLICATION_SECTIONS` — internal sections of a patent application (Abstract, Claims, Background, etc.)
- `DOCUMENT_TYPES` — filing type classifiers (Amendment after Non-Final, RCE, Appeal Brief, etc.)

Exports pre-compiled RegExp maps and lookup helpers. **No changes required.**

---

### `packages/shared-core/patent-parser.test.js` ✅ Built (needs additions)

**Current coverage:** 11 describe blocks covering all currently exported functions with real patent claim fixtures.

**Missing tests:**
- `detectDocumentType()` — no tests
- `checkAmendmentStatusIndicators()` — function not yet written
- `checkSpecificationSupport()` — function not yet written
- `cloneMethodToApparatus()` — function not yet written
- `parseOfficeAction()` — function not yet written

---

### `packages/amendment-converter/taskpane.html` ✅ Built

**What it does:** Self-contained Office.js add-in taskpane. Converts between Word tracked changes (OOXML `<w:ins>`/`<w:del>`) and USPTO-format markup (underline = insertion, strikethrough or `[[brackets]]` = deletion). Supports whole-document and selection-only scope. Implements mixed deletion mode (≤4 chars → brackets, longer → strikethrough) matching 37 CFR 1.121.

**Current issue:** The conversion logic is inlined directly in the taskpane HTML. It should be refactored to import from `shared-core` once the build system is in place. For now, the inline logic is authoritative.

**VBA source:** The logic was ported from a VBA macro (documented in project history). The port is functionally correct. Key constant `SHORT_TEXT_LIMIT = 4` is preserved.

---

## Phase 0 — Repository Scaffolding
**Status: Not started | Blocking: Everything**
**Assigned to: Infrastructure agent**

### Tasks

#### 0.1 — Initialize monorepo

Create root `package.json`:

```json
{
  "name": "kolslaw-utensils",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test":       "npm run test --workspaces --if-present",
    "test:core":  "npm run test --workspace=packages/shared-core",
    "build":      "node scripts/build.js",
    "dev":        "npx http-server deploy -p 5500 --cors"
  }
}
```

#### 0.2 — Create build script

`scripts/build.js` must:
1. For each directory in `packages/` that contains a `manifest.xml`, copy `taskpane.html` and `manifest.xml` to `deploy/[package-name]/`
2. Copy `packages/shared-core/patent-parser.js`, `uspto-headings.js`, `office-helpers.js`, and `ui-components.js` to `deploy/shared/`
3. Update all taskpane HTML files to reference `../shared/` for shared module imports
4. Write a `deploy/index.html` suite landing page listing all available tools

#### 0.3 — GitHub Actions CI

`.github/workflows/ci.yml` must:
1. On every PR: run `npm test` across all workspaces; block merge if any test fails
2. On merge to `main`: run build script, deploy `deploy/` folder to Netlify via Netlify CLI

#### 0.4 — Netlify configuration

Create `netlify.toml`:
```toml
[build]
  command   = "node scripts/build.js"
  publish   = "deploy"

[[headers]]
  for = "/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    X-Frame-Options = "ALLOWALL"
```

The `X-Frame-Options: ALLOWALL` header is required because Office.js loads taskpanes in an iframe.

#### 0.5 — Dev certificates

Add to root `package.json` scripts:
```json
"dev:https": "npx office-addin-dev-certs install && npx http-server deploy -p 5500 --ssl --cert ~/.office-addin-dev-certs/localhost.crt --key ~/.office-addin-dev-certs/localhost.key --cors"
```

Office Online requires HTTPS even for local development. Desktop Word accepts HTTP on localhost.

---

## Phase 1 — Shared Core Completion
**Status: Partially built | Blocking: All tool packages**
**Assigned to: Core engine agent**

### 1.1 — Add missing functions to `patent-parser.js`

#### `checkAmendmentStatusIndicators(claims)` → `StatusIndicatorIssue[]`

Validates that every claim in an amendment document carries exactly one USPTO status indicator, and that the indicator is used correctly.

**Rules:**
- Valid indicators: `(Currently Amended)`, `(Previously Presented)`, `(New)`, `(Cancelled)`, `(Withdrawn)`, `(Original)`
- A `(Cancelled)` claim must have no body text
- A `(New)` claim must not have existed in the parent application (cannot verify without filing history — flag for attorney review)
- A `(Currently Amended)` claim must contain tracked changes markup (underline/strikethrough) OR the amendment converter must have been run
- Missing indicator on any claim in an amendment context = error

**Return type:**
```javascript
/**
 * @typedef {Object} StatusIndicatorIssue
 * @property {number} claimNumber
 * @property {string} type  — "missing_indicator" | "invalid_body" | "unrecognized_indicator"
 * @property {string} message
 */
```

#### `checkSpecificationSupport(claims, specText)` → `SpecSupportIssue[]`

Checks that every key term used in the claims appears at least once in the specification body. This is a 35 U.S.C. § 112(a) written description check.

**Algorithm:**
1. Extract all claim terms using `extractIntroducedTerms()` across all claims
2. For each term, search `specText` using a word-boundary regex
3. If not found, also try singular/plural variants via `toSingular()`
4. If still not found, flag as unsupported

**Return type:**
```javascript
/**
 * @typedef {Object} SpecSupportIssue
 * @property {string} term
 * @property {number[]} usedInClaims   — claim numbers where term appears
 * @property {string}   type           — "term_not_in_spec"
 * @property {string}   message
 */
```

#### `cloneMethodToApparatus(claim)` → `string`

Takes a parsed independent method claim and returns suggested apparatus claim language.

**Transformation rules (apply in order):**
1. Replace preamble: `"A method of [X]"` → `"An apparatus for [X], comprising:"`
2. Replace transitional phrase: `"comprising:"` stays; `"the steps of:"` → `"comprising:"`
3. Transform each step limitation:
   - `"receiving [X]"` → `"a receiver configured to receive [X]"`
   - `"processing [X]"` → `"a processor configured to process [X]"`
   - `"generating [X]"` → `"a generator configured to generate [X]"`
   - `"storing [X]"` → `"a memory configured to store [X]"`
   - `"transmitting [X]"` → `"a transmitter configured to transmit [X]"`
   - `"displaying [X]"` → `"a display configured to display [X]"`
   - `"detecting [X]"` → `"a sensor configured to detect [X]"`
   - `"[verb]ing [X]"` (any other gerund) → `"a [verb]er configured to [verb] [X]"` (fallback)
4. The output is returned as a string, not inserted — the UI layer handles insertion

**Note:** This function produces a starting point for attorney review, not a final claim. The UI must clearly communicate this.

#### `parseOfficeAction(text)` → `OfficeAction`

Parses the text of a USPTO Office Action into structured data. Called by the OA Response Shell Generator.

**Return type:**
```javascript
/**
 * @typedef {Object} Rejection
 * @property {string}   statute      — "102" | "103" | "112(a)" | "112(b)" | "101" | "other"
 * @property {number[]} claims       — claim numbers rejected
 * @property {string[]} references   — cited prior art (patent numbers, publication names)
 * @property {string}   rawText      — full text of the rejection paragraph
 */
/**
 * @typedef {Object} Objection
 * @property {string} target         — "specification" | "drawings" | "abstract" | "claim [N]"
 * @property {string} rawText
 */
/**
 * @typedef {Object} OfficeAction
 * @property {string}      applicationNumber
 * @property {string}      mailingDate
 * @property {string}      examinerName
 * @property {string}      artUnit
 * @property {Rejection[]} rejections
 * @property {Objection[]} objections
 * @property {string[]}    allowedClaims
 * @property {string}      rawText
 */
```

**Detection patterns:**
- Application number: `/Application No\.\s*([\d\/,]+)/i`
- Mailing date: `/Mailing Date:\s*([\w\s,]+\d{4})/i`
- Examiner: `/Examiner[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/`
- Art unit: `/Art Unit[:\s]+(\d{4})/i`
- § 102 rejection: `/rejected under\s+35\s+U\.?S\.?C\.?\s+[§\s]*102/gi`
- § 103 rejection: `/rejected under\s+35\s+U\.?S\.?C\.?\s+[§\s]*103/gi`
- § 112 rejection: `/rejected under\s+35\s+U\.?S\.?C\.?\s+[§\s]*112/gi`
- Claim numbers in a rejection: `/[Cc]laims?\s+([\d,\s\-and]+)/g`
- Patent citations: `/U\.S\.\s+Patent\s+(?:No\.?\s+)?(\d[\d,]+)/gi`, `/U\.S\.\s+Patent\s+Application\s+Publication\s+No\.?\s+([\d\/]+)/gi`
- Allowed claims: `/[Cc]laims?\s+([\d,\s\-and]+)\s+(?:are|is)\s+(?:allowed|allowable)/gi`

### 1.2 — Expand `toSingular()` for patent vocabulary

Add handling for:
- "matrices" → "matrix"
- "indices" → "index"  
- "vertices" → "vertex"
- "axes" → "axis"
- "data" → "data" (no change — uncountable)
- "means" → "means" (no change — used as noun in MPF)
- "species" → "species" (no change)

### 1.3 — Expand `STOPWORD_PHRASES` in `extractIntroducedTerms()`

After real claim review, add to the set:
`"plurality"`, `"combination"`, `"subset"`, `"set"`, `"group"`, `"series"`, `"sequence"`, `"range"`, `"pair"`, `"angle"`, `"axis"`, `"embodiment"`, `"variation"`, `"implementation"`

### 1.4 — Add tests for all new functions

Every function added in 1.1 must have:
- At least 3 positive test cases (function finds what it should)
- At least 2 negative test cases (function does not flag what it shouldn't)
- At least 1 edge case (empty input, single-claim document, all-cancelled claims, etc.)
- All test fixtures must use realistic patent claim language, not toy examples

### 1.5 — Build `office-helpers.js`

This is the only file in `shared-core` that imports from Office.js. All other files are pure JavaScript. Every function here returns a Promise.

**Required exports:**

```javascript
/**
 * Returns the full text of the document body.
 * @returns {Promise<string>}
 */
export async function getDocumentText(ctx)

/**
 * Returns the full OOXML of the document body.
 * @returns {Promise<string>}
 */
export async function getDocumentOoxml(ctx)

/**
 * Returns the text of the current selection, or null if nothing selected.
 * @returns {Promise<string|null>}
 */
export async function getSelectionText(ctx)

/**
 * Returns the OOXML of the current selection, or null if nothing selected.
 * @returns {Promise<string|null>}
 */
export async function getSelectionOoxml(ctx)

/**
 * Replaces the document body with new OOXML.
 * @param {string} ooxml
 */
export async function setDocumentOoxml(ctx, ooxml)

/**
 * Replaces the current selection with new OOXML.
 * @param {string} ooxml
 */
export async function setSelectionOoxml(ctx, ooxml)

/**
 * Inserts text at the end of the document.
 * @param {string} text
 * @param {Object} [options] — { bold, underline, strikethrough, fontSize, asTrackedChange }
 */
export async function appendText(ctx, text, options)

/**
 * Inserts a table at the cursor or end of document.
 * @param {string[][]} data     — rows × cols of cell content
 * @param {Object}     [options] — { headerRow, columnWidths }
 */
export async function insertTable(ctx, data, options)

/**
 * Finds all runs with a specific formatting flag and returns their ranges.
 * Used by amendment-converter and claim-linter to find underlined/struck text.
 * @param {"underline"|"strikethrough"|"bold"} formatType
 * @returns {Promise<Array<{text: string, startIndex: number}>>}
 */
export async function findFormattedRanges(ctx, formatType)

/**
 * Returns true if there are any tracked changes in the document.
 * @returns {Promise<boolean>}
 */
export async function hasTrackedChanges(ctx)

/**
 * Accepts all tracked changes in the document.
 */
export async function acceptAllTrackedChanges(ctx)

/**
 * Returns document properties: author, word count, paragraph count.
 * @returns {Promise<{author: string, wordCount: number, paragraphCount: number}>}
 */
export async function getDocumentProperties(ctx)

/**
 * Shows a notification in the Word UI (Office.js notification API).
 * @param {string} message
 * @param {"informational"|"warning"|"error"} type
 */
export function showNotification(message, type)

/**
 * Wraps a Word.run call with standard error handling and screen-update suppression.
 * All tool operations should use this instead of calling Word.run directly.
 * @param {Function} fn  — async (ctx) => { ... }
 * @returns {Promise<any>}
 */
export async function runWithContext(fn)
```

**Implementation notes:**
- `runWithContext()` must suppress `ScreenUpdating`, catch errors, and re-throw them with a user-friendly prefix
- All functions accept a `ctx` parameter (the `Word.RequestContext`) — they do not call `Word.run` themselves except `runWithContext`
- `findFormattedRanges()` must operate on OOXML, not the high-level Word API, because the high-level API doesn't expose formatting of arbitrary ranges reliably

### 1.6 — Build `ui-components.js`

A library of shared UI primitives used by every taskpane. This is plain HTML/CSS/JS — no framework.

**Required exports (as functions that return HTML strings or DOM elements):**

```javascript
// Status bar — shows loading / success / error states
export function createStatusBar(id)
export function setStatusLoading(id, message)
export function setStatusSuccess(id, message)
export function setStatusError(id, message)
export function setStatusInfo(id, message)
export function clearStatus(id)

// Buttons
export function createPrimaryButton(label, onClick)
export function createSecondaryButton(label, onClick)
export function createGhostButton(label, onClick)

// Issue list — renders a list of linter findings
// Each issue: { claimNumber, type, message, severity }
export function createIssueList(issues, onIssueClick)
export function createIssueRow(issue)

// Scope toggle (Whole Document / Selection Only)
export function createScopeToggle(onChange)
export function getScopeToggleValue(toggleEl)

// Section — a labeled card container
export function createSection(eyebrowLabel, children)

// Header — the Kolslaw brand header, takes tool name
export function createHeader(toolName)

// Footer
export function createFooter(toolName, version, cfr)

// Copy button — copies text to clipboard
export function createCopyButton(getText)

// Spinner for async operations
export function createSpinner()

// Modal — for confirmations
export function createModal(title, body, onConfirm, onCancel)
```

**Design system (all values defined as CSS variables, consistent with existing taskpane.html):**

All components must use the design tokens already established in `amendment-converter/taskpane.html`:

```css
--navy:        #0d1b2a
--navy-mid:    #152336
--amber:       #c8960c
--amber-light: #f0b429
--cream:       #f0ead8
--cream-dim:   rgba(240,234,216,0.55)
--border:      rgba(200,150,12,0.18)
--border-soft: rgba(200,150,12,0.08)
--success-bg / --success-bd / --success-tx
--error-bg   / --error-bd   / --error-tx
```

Fonts: `'Playfair Display'` for brand wordmark only; `'IBM Plex Mono'` for labels, codes, and monospace; `'IBM Plex Sans'` for body text.

---

## Phase 2 — Amendment Converter Refactor
**Status: Built but needs integration | Depends on: Phase 1 complete**
**Assigned to: Amendment converter agent**

The existing `taskpane.html` is self-contained and working. This phase refactors it to consume `shared-core` and `ui-components.js` rather than having inlined CSS and logic.

### 2.1 — Extract OOXML transform logic into `patent-parser.js`

The two core transform functions currently inlined in `taskpane.html`:
- `applyTcToUsptoTransform(xmlDoc, delStyle)` 
- `applyUsptToTcTransform(xmlDoc)`

These are pure functions that take an XML document and return a transformed XML string. They have no dependency on Office.js. Move them to `patent-parser.js` as named exports. The taskpane imports them from `../shared/patent-parser.js`.

### 2.2 — Replace inlined UI with `ui-components.js`

Replace all inline CSS variables and component HTML with imports from `ui-components.js`. The visual result must be identical.

### 2.3 — Replace inline `getOoxml`/`setOoxml` with `office-helpers.js`

The scope-aware OOXML read/write currently inlined in the taskpane moves to `office-helpers.js` as `getDocumentOoxml()`, `getSelectionOoxml()`, etc.

### 2.4 — Update manifest.xml

Replace all `https://YOUR-HOST/` placeholders with the actual Netlify deployment URL once Phase 0 CI is complete.

---

## Phase 3 — Claim Linter
**Status: Not built | Depends on: Phases 0, 1 complete**
**Assigned to: Claim linter agent**
**Target: First tool to ship after amendment converter**

This is the highest-value standalone tool. It replaces the core value proposition of ClaimMaster for 90% of users.

### Architecture

```
packages/claim-linter/
├── taskpane.html     ← UI only; imports shared-core and ui-components
├── linter.js         ← Orchestrates runFullLint(); maps results to UI
├── manifest.xml
└── package.json
```

### Taskpane UI Specification

The taskpane has two views: **Input** and **Results**.

**Input view:**
- Scope toggle (Whole Document / Selection Only / Claims Section Only)
- Single "Run Linter" button
- Brief description of what will be checked

**Results view (after linting):**
- Summary bar: `X issues found in Y claims` with color coding (green = 0, amber = 1–5, red = 6+)
- Issue list grouped by claim number
- Each issue row shows:
  - Claim number badge
  - Issue type label (color-coded by severity)
  - Issue message
  - Click handler: clicking an issue scrolls Word to that claim (via `office-helpers.js` find-and-select)
- Severity levels: `error` (red), `warning` (amber), `info` (cream)
- "Run Again" button at bottom
- "Copy Report" button — copies plain text summary to clipboard

### Severity Classification

| Check | Severity |
|---|---|
| Missing antecedent basis | error |
| Double introduction | error |
| Missing period at end of claim | error |
| Forward reference (depends on later claim) | error |
| Missing parent claim | error |
| Claim numbering gap | error |
| § 112(f) means-plus-function | warning |
| § 112(f) step-plus-function | warning |
| Multiple dependent claim | warning |
| Status indicator missing | warning |
| § 112(b) relative term | info |
| Negative limitation | info |
| Term not in specification | warning |

### `linter.js` specification

```javascript
/**
 * Main entry point. Reads the document, parses claims, runs all checks,
 * returns a unified result set ready for the UI to render.
 *
 * @param {Word.RequestContext} ctx
 * @param {Object} options
 * @param {"document"|"selection"|"claims"} options.scope
 * @returns {Promise<LinterResult>}
 */
export async function runLinter(ctx, options)

/**
 * @typedef {Object} LinterIssue
 * @property {number}   claimNumber
 * @property {string}   type
 * @property {string}   message
 * @property {"error"|"warning"|"info"} severity
 * @property {string}   [context]    — text snippet for location
 */

/**
 * @typedef {Object} LinterResult
 * @property {LinterIssue[]} issues
 * @property {number}        claimsChecked
 * @property {number}        errorCount
 * @property {number}        warningCount
 * @property {number}        infoCount
 * @property {ClaimCountReport} counts   — from patent-parser.js countClaims()
 */
```

### Tests (`linter.test.js`)

Must include integration tests using a full realistic claim set with known errors. At minimum:
- A 5-claim set with no errors → zero issues
- A claim set with every error type → each error detected exactly once
- A dependent claim that inherits correct antecedent basis → no false positive
- A cancelled claim → not linted

---

## Phase 4 — PTO Compliance Checker
**Status: Not built | Depends on: Phases 0, 1 complete**
**Assigned to: Compliance checker agent**

Implements fee calculation and filing compliance checks. Most logic already exists in `patent-parser.js` via `countClaims()` and `checkClaimFormat()`.

### Architecture

```
packages/pto-compliance/
├── taskpane.html
├── compliance.js
└── manifest.xml
```

### Checks to implement

All implemented in `compliance.js`, consuming `patent-parser.js` functions:

1. **Claim counts** — total, independent, dependent, cancelled (from `countClaims()`)
2. **Fee exposure** — extra total claims, extra independent claims, multiple dependent claim surcharge (from `countClaims()`)
3. **Claim format** — period, numbering, forward references (from `checkClaimFormat()`)
4. **Abstract length** — USPTO requires abstract ≤ 150 words; count words in abstract section
5. **Claim length** — flag any single claim exceeding 600 words (readability heuristic)
6. **Specification paragraph numbers** — USPTO requires paragraph numbers `[0001]`, `[0002]` etc. in published applications; scan spec for these and verify sequential
7. **Independent claim limit** — flag if > 3 independent claims (fee threshold)

### UI Specification

Display as a dashboard with sections:
- **Claim Summary** — table: Total | Independent | Dependent | Cancelled
- **Fee Exposure** — table: Extra Total | Extra Independent | Multiple Dependent — with dollar amounts (store current fees as constants, note they change; include last-updated date)
- **Filing Checklist** — list of pass/fail items with icons
- **Issues** — same issue list component as claim linter

### Fee constants (update annually)

```javascript
// 37 CFR 1.16 — as of 2025
// Source: https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule
export const USPTO_FEES = {
  extraClaim:            100,   // per claim over 20
  extraIndependent:      480,   // per independent claim over 3
  multipleDependent:    860,   // flat surcharge if any multiple dep claim
  lastUpdated:          "2025-01-01",
};
```

---

## Phase 5 — Claim Charter
**Status: Not built | Depends on: Phase 1 complete**
**Assigned to: Claim charter agent**

Generates a structured claim chart table in the Word document.

### Architecture

```
packages/claim-charter/
├── taskpane.html
├── charter.js
└── manifest.xml
```

### Charter formats to support

**Format A — Dependency Chart:** Rows = claims, Columns = Claim #, Type (Ind/Dep), Depends On, First Limitation, Full Text

**Format B — Limitation Chart:** Rows = limitations (one per semicolon-separated clause), Columns = Claim #, Limitation Text. Used for infringement analysis.

**Format C — Status Chart:** Used in amendments. Rows = claims, Columns = Claim #, Status Indicator, Summary. Pre-populated with `(Currently Amended)` etc. based on tracked changes presence.

### `charter.js` specification

```javascript
/**
 * Builds and inserts a claim chart into the document.
 * @param {Word.RequestContext} ctx
 * @param {Claim[]} claims       — from patent-parser.js parseClaims()
 * @param {"dependency"|"limitation"|"status"} format
 */
export async function insertClaimChart(ctx, claims, format)
```

Table insertion uses `office-helpers.js insertTable()`. Column widths must be calculated dynamically based on format and claim count.

---

## Phase 6 — Application Generator
**Status: Not built | Depends on: Phase 1 complete**
**Assigned to: App generator agent**

Takes a set of claims and generates a patent application template with LLM prompts.

### Architecture

```
packages/app-generator/
├── taskpane.html
├── generator.js
└── manifest.xml
```

### Two modes

**Mode 1 — Skeleton Template:** Inserts a full application skeleton into the document with section headers from `uspto-headings.js` and placeholder text. Sections: Title, Cross-References, Field, Background, Summary, Brief Description of Drawings, Detailed Description, Claims (copied from parsed input), Abstract.

**Mode 2 — Prompt Generator:** Instead of boilerplate, generates a task pane list of copy-ready LLM prompts, one per section, with the relevant claim text pre-embedded in the prompt.

### Prompt templates

Each prompt must:
1. Include the full text of all independent claims
2. Include the section purpose in plain English
3. Be completable by any general-purpose LLM (not model-specific)
4. Be prefixed with a brief instruction to "respond only with the text of the section, no preamble"

Example prompt for Detailed Description → term definition:

```
You are a patent attorney drafting a patent application. 
The following are the claims of the application:

[CLAIMS TEXT]

Write three paragraphs defining the term "[TERM]" for the 
Detailed Description section. The definition must:
- Be consistent with how the term is used in the claims
- Describe structure, function, and at least one material or implementation
- Not limit the scope of the claims beyond what is stated
- Use the phrase "In one embodiment" for at least one alternative

Respond with only the paragraphs, no introduction.
```

Prompts are displayed in the task pane with a "Copy" button next to each. Each prompt card shows: section name, estimated token count, copy button.

### `generator.js` specification

```javascript
/**
 * Generates application skeleton sections.
 * @param {Claim[]} claims
 * @returns {ApplicationSkeleton}
 */
export function generateSkeleton(claims)

/**
 * Generates copy-ready LLM prompts for each application section.
 * @param {Claim[]} claims
 * @returns {PromptSet}
 */
export function generatePrompts(claims)

/**
 * @typedef {Object} ApplicationSkeleton
 * @property {string} title
 * @property {string} crossRef
 * @property {string} field
 * @property {string} background
 * @property {string} summary
 * @property {string} briefDrawings
 * @property {string} detailedDescription
 * @property {string} abstract
 */

/**
 * @typedef {Object} Prompt
 * @property {string} section
 * @property {string} label
 * @property {string} promptText
 * @property {number} estimatedTokens
 */

/**
 * @typedef {Object} PromptSet
 * @property {Prompt[]} prompts
 * @property {string}   claimsText    — the claim text embedded in all prompts
 */
```

---

## Phase 7 — OA Response Shell Generator
**Status: Not built | Depends on: Phase 1 complete (specifically parseOfficeAction())**
**Assigned to: OA response agent**

### Architecture

```
packages/oa-response-shell/
├── taskpane.html
├── response-generator.js
└── manifest.xml
```

### Workflow

1. User pastes Office Action text into the active Word document (or selects it)
2. Tool runs `parseOfficeAction()` from `patent-parser.js`
3. Tool generates a response shell document with correct section headers from `uspto-headings.js`
4. Shell includes: Cover sheet stub, Amendments to Claims section (with each rejected claim listed with status indicator placeholder), Remarks section (with subsections per rejection, pre-populated with the statute and cited art)

### Shell structure

```
IN THE UNITED STATES PATENT AND TRADEMARK OFFICE

Application No.:   [from parsed OA]
Filing Date:       [from parsed OA if available]
Examiner:          [from parsed OA]
Art Unit:          [from parsed OA]
Docket No.:        [PLACEHOLDER]

RESPONSE TO [NON-FINAL / FINAL] OFFICE ACTION

AMENDMENTS TO THE CLAIMS

Please amend the claims as follows:

1. (Currently Amended) [original claim text — populated from document]
...

REMARKS

Applicant respectfully submits the following remarks in response to the
Office Action dated [mailing date].

REJECTION UNDER 35 U.S.C. § [statute] — CLAIMS [N, M, O]

The Examiner rejected claims [N, M, O] under 35 U.S.C. § [statute] 
as [anticipated by / rendered obvious by] [reference(s)].

Applicant respectfully traverses this rejection for the following reasons:

[ARGUMENT PLACEHOLDER]

...
```

### `response-generator.js` specification

```javascript
/**
 * Generates a response shell from a parsed Office Action.
 * @param {OfficeAction} oaData        — from patent-parser.js parseOfficeAction()
 * @param {Claim[]}      currentClaims — current claim set from the application
 * @returns {string}                   — formatted response shell text
 */
export function generateResponseShell(oaData, currentClaims)
```

---

## Phase 8 — Term Consistency Checker
**Status: Not built | Depends on: Phase 1 complete**
**Assigned to: Term consistency agent**

### Architecture

```
packages/term-consistency/
├── taskpane.html
├── consistency.js
└── manifest.xml
```

### Features

1. **Auto-detect mode:** Runs `extractIntroducedTerms()` across all claims, then `checkTermConsistency()` against the specification. Reports terms used in claims that appear in variant form in the spec.

2. **Custom terms mode:** User can add preferred terms to a list in the task pane. Tool scans the full document for variants and flags them with the preferred alternative.

3. **One-click replacement:** For each flagged variant, offer a "Replace All" button that uses Word's Find & Replace (via `office-helpers.js`) to substitute the variant with the preferred term throughout the document.

### UI Specification

Two-panel layout:
- Left: Preferred Terms list (editable; user can add/remove)
- Right: Flagged Variants list (term | found variant | location | Replace button)

---

## Phase 9 — Part Number Manager
**Status: Not built | Depends on: Phase 1 complete**
**Assigned to: Part number agent**

### Architecture

```
packages/part-number-manager/
├── taskpane.html
├── part-numbers.js
└── manifest.xml
```

### Features

1. **Extract all part numbers** — scan spec and claims using `extractPartNumbers()`
2. **Detect conflicts** — same number used for two different elements
3. **Detect duplicates** — same element referred to by two different numbers
4. **Detect gaps** — identify gaps in the numbering sequence
5. **Generate part number table** — insert a table: Number | Element Name | First Occurrence

### `part-numbers.js` specification

```javascript
/**
 * @typedef {Object} PartNumberConflict
 * @property {string}   number
 * @property {string[]} elements   — two or more element names mapped to this number
 * @property {string}   type       — "duplicate_number" | "duplicate_element" | "gap"
 */

/**
 * Analyzes all part number references in the document.
 * @param {string} specText
 * @returns {{ parts: PartNumber[], conflicts: PartNumberConflict[] }}
 */
export function analyzePartNumbers(specText)
```

---

## Phase 10 — Visual Claim Tree
**Status: Not built | Depends on: Phases 0, 1 complete | Complex — build last**
**Assigned to: Claim tree agent**

### Architecture

```
packages/claim-tree/
├── taskpane.html          ← Imports D3.js from CDN
├── tree-renderer.js       ← D3 rendering and drag/drop
├── claim-merger.js        ← Language suggestion logic
└── manifest.xml
```

### Features

1. **Visual tree** — renders the claim dependency graph as a vertical tree. Independent claims are roots; dependent claims branch downward. Each node shows: claim number, first 60 characters of claim text, type badge (Ind/Dep).

2. **Drag-and-drop** — D3 drag handlers allow a dependent claim node to be dragged onto another claim. On drop, the antecedent basis check runs before any changes are proposed.

3. **Merge suggestion** — if a dependent claim is dropped onto its parent (or another valid target), the tool generates a suggested merged claim combining the text of both claims. Displayed in a modal for attorney review and approval before insertion.

4. **Click to scroll** — clicking a claim node scrolls Word to that claim in the document.

### D3.js version

Use D3 v7 from CDN: `https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js`

### Task pane sizing

Task panes are constrained in height. The tree must render in a scrollable SVG container with minimum height of 600px. Pan and zoom must be supported via D3's zoom behavior.

### `claim-merger.js` specification

```javascript
/**
 * Attempts to merge a dependent claim into a target claim.
 * Returns null if antecedent basis check fails.
 *
 * @param {Claim} sourceClaim     — the dependent claim being merged in
 * @param {Claim} targetClaim     — the claim it's being dropped onto
 * @param {Map<number,Claim>} claimMap
 * @returns {string|null}         — suggested merged claim text, or null if invalid
 */
export function suggestMerge(sourceClaim, targetClaim, claimMap)
```

**Merge algorithm:**
1. Run antecedent basis check: does `targetClaim` provide basis for all terms that `sourceClaim` references as "the [term]"?
2. If not, return null (caller shows "incompatible" message)
3. If yes, construct merged text:
   - Use `targetClaim.preamble` and `targetClaim.transition`
   - Append `targetClaim.limitations` as the base limitations
   - Append `sourceClaim.limitations` (filtering out the dependency preamble "The [X] of claim N")
   - End with a period
4. Return the merged text for attorney review

---

## Phase 11 — Super App
**Status: Not built | Depends on: All individual tools complete**
**Assigned to: Super app agent**

A single Office Add-in that combines all tools into one installation.


### Architecture

```
packages/super-app/
├── taskpane.html     ← Navigation shell that loads individual tool views
├── manifest.xml      ← Single manifest for all tools
└── package.json
```

### Navigation

Tab-based or side-navigation. Each tab loads the corresponding tool's UI. Shared state: the document is parsed once on first load and cached; each tool subscribes to the parsed result.

### Manifest

The super-app manifest registers a single ribbon group "Kolslaw" with one button "Open Utensils" that opens the multi-tool taskpane.

---
## Phase 12 — Copilot Agent Layer
**Status: Not built | Depends on: Phase 11 (Super App) complete | Non-blocking — additive only**
**Assigned to: Copilot integration agent**
**User prerequisite: Microsoft 365 Copilot license (~$30/user/month)**

This phase adds a declarative Copilot agent to the super-app package. It does not change
any existing tool logic. Every function exposed to Copilot is already written — this phase
is purely a wiring and configuration layer that registers those functions as agent actions
and defines the natural language interface for invoking them.

The direction of invocation is always Copilot → add-in. There is no API to
programmatically send prompts to Copilot from a taskpane. Users without a Copilot license
are unaffected — the taskpane tools continue to work exactly as before.


### 12.1 — Manifest Migration: XML → Unified JSON

All existing packages use the legacy XML add-in manifest format. The Copilot agent
integration requires the unified JSON manifest (also called the "Teams app manifest" or
"Microsoft 365 app manifest"). This migration must happen at the super-app level only —
individual tool packages keep their XML manifests for standalone distribution.

**Migration steps:**

1. Use the Microsoft 365 Agents Toolkit VS Code extension to convert
   `packages/super-app/manifest.xml` to `packages/super-app/appPackage/manifest.json`.
   Alternatively, follow the manual conversion guide at:
   https://learn.microsoft.com/en-us/office/dev/add-ins/develop/convert-xml-to-json-manifest

2. The converted manifest must set:
```json
   {
     "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
     "manifestVersion": "devPreview",
     "version": "1.0.0",
     "id": "{{SUPER_APP_GUID}}"
   }
```

3. Verify that all existing super-app taskpane functionality still works after migration
   before adding any agent configuration. Migration must not regress the taskpane.

4. Update `scripts/build.js` to package the unified manifest app package (a `.zip` of
   `appPackage/`) separately from the static Netlify deploy. Netlify still serves the
   taskpane HTML. The app package zip is a separate distribution artifact for IT admins
   deploying via Microsoft Admin Center.


### 12.2 — Commands File

Create `packages/super-app/src/commands/commands.js`. This is the UI-less JavaScript file
whose functions are invoked by Copilot. It must not contain any taskpane UI logic.
```javascript
/**
 * commands.js
 * Kolslaw Utensils — Super App · Copilot Agent Actions
 *
 * These functions are invoked by the Copilot agent via Office.actions.associate().
 * They are NOT invoked from the taskpane UI — that path goes through office-helpers.js.
 *
 * Constraints:
 *   - Each function must return within 2 minutes or the runtime is shut down.
 *   - Parameters arrive as a JSON string in the `message` argument.
 *   - Return value is a plain object or string passed back to the Copilot runtime.
 *   - No Office.AddinCommands.Event parameter — do NOT call event.completed().
 */

Office.onReady(function () {
  // Initialization — associate all action IDs before Copilot invokes anything
  Office.actions.associate("RunClaimLinter",          runClaimLinterAction);
  Office.actions.associate("ConvertToUSPTO",          convertToUSPTOAction);
  Office.actions.associate("ConvertToTrackChanges",   convertToTrackChangesAction);
  Office.actions.associate("RunPtoCompliance",        runPtoComplianceAction);
  Office.actions.associate("GetClaimCount",           getClaimCountAction);
  Office.actions.associate("CheckAntecedentBasis",    checkAntecedentBasisAction);
  Office.actions.associate("GenerateResponseShell",   generateResponseShellAction);
  Office.actions.associate("CheckTermConsistency",    checkTermConsistencyAction);
});


// ── ACTION: Run full claim linter ─────────────────────────────────────────
/**
 * Invoked when user asks Copilot to lint or check claims.
 * Example utterances:
 *   "Check this document's claims for errors"
 *   "Run the claim linter on claims 1 through 5"
 *   "Are there any antecedent basis issues?"
 *
 * @param {string} message — JSON: { scope?: "document"|"selection" }
 * @returns {{ summary: string, issueCount: number, issues: LinterIssue[] }}
 */
async function runClaimLinterAction(message) {
  const { scope = "document" } = JSON.parse(message || "{}");
  return await Word.run(async (ctx) => {
    const text   = scope === "selection"
      ? await getSelectionText(ctx)
      : await getDocumentText(ctx);
    const claims = parseClaims(text);
    const result = runFullLint(claims);
    const issues = [
      ...result.antecedentIssues,
      ...result.formatIssues,
      ...result.section112Issues,
    ];
    return {
      summary:    `Found ${issues.length} issue(s) across ${claims.length} claim(s).`,
      issueCount: issues.length,
      issues:     issues.slice(0, 20), // Copilot response cap — surface top 20
    };
  });
}


// ── ACTION: Convert tracked changes → USPTO format ────────────────────────
/**
 * Example utterances:
 *   "Convert tracked changes to USPTO format"
 *   "Flatten the redlines to amendment markup"
 *   "Convert to strikethrough and underline format"
 *
 * @param {string} message — JSON: { deletionStyle?: "mixed"|"strikethrough" }
 * @returns {{ message: string }}
 */
async function convertToUSPTOAction(message) {
  const { deletionStyle = "mixed" } = JSON.parse(message || "{}");
  return await Word.run(async (ctx) => {
    const ooxml  = await getDocumentOoxml(ctx);
    const xmlDoc = new DOMParser().parseFromString(ooxml, "application/xml");
    const result = applyTcToUsptoTransform(xmlDoc, deletionStyle);
    await setDocumentOoxml(ctx, result);
    return { message: "Converted tracked changes to USPTO amendment format." };
  });
}


// ── ACTION: Convert USPTO markup → tracked changes ────────────────────────
/**
 * Example utterances:
 *   "Convert USPTO markup back to tracked changes"
 *   "Restore the redlines from amendment format"
 *   "Turn the strikethrough and underline into Word track changes"
 *
 * @param {string} message — JSON: {} (no parameters needed)
 * @returns {{ message: string }}
 */
async function convertToTrackChangesAction(message) {
  return await Word.run(async (ctx) => {
    const ooxml  = await getDocumentOoxml(ctx);
    const xmlDoc = new DOMParser().parseFromString(ooxml, "application/xml");
    const result = applyUsptToTcTransform(xmlDoc);
    await setDocumentOoxml(ctx, result);
    return { message: "Restored USPTO markup as Word tracked changes." };
  });
}


// ── ACTION: PTO compliance check ──────────────────────────────────────────
/**
 * Example utterances:
 *   "How many independent claims do I have?"
 *   "Will I owe extra claim fees?"
 *   "Check my claim counts against USPTO thresholds"
 *   "What are my filing fees for claims?"
 *
 * @param {string} message — JSON: {}
 * @returns {ClaimCountReport & { feeExposure: string }}
 */
async function runPtoComplianceAction(message) {
  return await Word.run(async (ctx) => {
    const text   = await getDocumentText(ctx);
    const claims = parseClaims(text);
    const report = countClaims(claims);
    const fees   = [];
    if (report.extraTotal > 0)
      fees.push(`${report.extraTotal} extra claim(s) at $100 each = $${report.extraTotal * 100}`);
    if (report.extraIndependent > 0)
      fees.push(`${report.extraIndependent} extra independent claim(s) at $480 each = $${report.extraIndependent * 480}`);
    if (report.hasMultipleDependent)
      fees.push("Multiple dependent claim surcharge: $860");
    return {
      ...report,
      feeExposure: fees.length > 0 ? fees.join("; ") : "No extra claim fees.",
    };
  });
}


// ── ACTION: Get claim count (lightweight) ─────────────────────────────────
/**
 * Example utterances:
 *   "How many claims are in this document?"
 *   "How many independent claims do I have?"
 *
 * @param {string} message — JSON: {}
 * @returns {{ total: number, independent: number, dependent: number }}
 */
async function getClaimCountAction(message) {
  return await Word.run(async (ctx) => {
    const text   = await getDocumentText(ctx);
    const claims = parseClaims(text);
    const report = countClaims(claims);
    return {
      total:       report.total,
      independent: report.independent,
      dependent:   report.dependent,
    };
  });
}


// ── ACTION: Antecedent basis check only ───────────────────────────────────
/**
 * Example utterances:
 *   "Check antecedent basis"
 *   "Are there any 'the' without prior 'a' in the claims?"
 *   "Find missing antecedent basis issues"
 *
 * @param {string} message — JSON: { claimNumber?: number }
 * @returns {{ issues: AntecedentIssue[], summary: string }}
 */
async function checkAntecedentBasisAction(message) {
  const { claimNumber } = JSON.parse(message || "{}");
  return await Word.run(async (ctx) => {
    const text   = await getDocumentText(ctx);
    let   claims = parseClaims(text);
    if (claimNumber) claims = claims.filter(c => c.number === claimNumber);
    const issues = checkAntecedentBasis(claims);
    return {
      issues,
      summary: issues.length === 0
        ? "No antecedent basis issues found."
        : `Found ${issues.length} antecedent basis issue(s).`,
    };
  });
}


// ── ACTION: Generate OA response shell ────────────────────────────────────
/**
 * Example utterances:
 *   "Generate a response shell from this office action"
 *   "Create an amendment template from the rejection"
 *   "Build a response to this office action"
 *
 * @param {string} message — JSON: {}
 * @returns {{ message: string }}
 */
async function generateResponseShellAction(message) {
  return await Word.run(async (ctx) => {
    const text      = await getDocumentText(ctx);
    const oaData    = parseOfficeAction(text);
    const claims    = parseClaims(text);
    const shell     = generateResponseShell(oaData, claims);
    await appendText(ctx, shell);
    return {
      message: `Response shell generated. Found ${oaData.rejections.length} rejection(s).`,
    };
  });
}


// ── ACTION: Term consistency check ────────────────────────────────────────
/**
 * Example utterances:
 *   "Check term consistency"
 *   "Are my claim terms used consistently in the spec?"
 *   "Find inconsistent terminology"
 *
 * @param {string} message — JSON: {}
 * @returns {{ issues: ConsistencyIssue[], summary: string }}
 */
async function checkTermConsistencyAction(message) {
  return await Word.run(async (ctx) => {
    const text     = await getDocumentText(ctx);
    const sections = parseDocumentStructure(text);
    const claims   = parseClaims(text);
    const specText = sections.detailedDescription?.body || text;
    const terms    = claims.flatMap(c => c.terms);
    const issues   = checkTermConsistency(terms, specText);
    return {
      issues,
      summary: issues.length === 0
        ? "No term consistency issues found."
        : `Found ${issues.length} inconsistent term(s).`,
    };
  });
}
```

Create the accompanying `commands.html`:
```html


  
    
    
    
    
    
    
    
  
  

```


### 12.3 — Runtime Configuration in Unified Manifest

Add the commands runtime and agent declaration to `appPackage/manifest.json`:
```json
"extensions": [
  {
    "requirements": { "scopes": ["document"] },
    "runtimes": [
      {
        "id": "CommandsRuntime",
        "type": "general",
        "code": {
          "page": "{{DEPLOY_URL}}/super-app/commands.html"
        },
        "lifetime": "short",
        "actions": [
          { "id": "RunClaimLinter",         "type": "executeDataFunction" },
          { "id": "ConvertToUSPTO",         "type": "executeDataFunction" },
          { "id": "ConvertToTrackChanges",  "type": "executeDataFunction" },
          { "id": "RunPtoCompliance",       "type": "executeDataFunction" },
          { "id": "GetClaimCount",          "type": "executeDataFunction" },
          { "id": "CheckAntecedentBasis",   "type": "executeDataFunction" },
          { "id": "GenerateResponseShell",  "type": "executeDataFunction" },
          { "id": "CheckTermConsistency",   "type": "executeDataFunction" }
        ]
      }
    ]
  }
],
"copilotAgents": {
  "declarativeAgents": [
    {
      "id": "KolslawPatentAgent",
      "file": "declarativeAgent.json"
    }
  ]
}
```


### 12.4 — Declarative Agent Configuration

Create `packages/super-app/appPackage/declarativeAgent.json`:
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.5/schema.json",
  "version": "v1.5",
  "name": "Kolslaw Patent Assistant",
  "description": "A patent prosecution assistant that can lint claims, check antecedent basis, convert amendment formats, verify PTO compliance, and generate office action response shells — all operating on the open Word document.",
  "instructions": "You are a patent prosecution assistant for a US patent attorney. You have access to tools that read and analyze the active Word document. When asked to check claims, always run the full linter. When asked about fees, always run the PTO compliance check. When the user asks about a specific claim number, pass it as a parameter. Always summarize results in plain language suitable for a patent attorney. Never fabricate claim text or legal conclusions — only report what the tools return. If a tool returns zero issues, say so explicitly.",
  "conversation_starters": [
    {
      "text": "Check this document's claims for errors"
    },
    {
      "text": "How many independent claims do I have and will I owe extra fees?"
    },
    {
      "text": "Convert the tracked changes to USPTO amendment format"
    },
    {
      "text": "Are there any antecedent basis issues in my claims?"
    },
    {
      "text": "Generate a response shell from this office action"
    },
    {
      "text": "Check whether my claim terms are used consistently in the spec"
    }
  ],
  "actions": [
    {
      "id": "KolslawAddInActions",
      "file": "apiPlugin.json"
    }
  ]
}
```


### 12.5 — API Plugin Configuration

Create `packages/super-app/appPackage/apiPlugin.json`. This file describes each action to
Copilot's reasoning layer — it determines when Copilot decides to invoke each function and
what parameters it can extract from natural language.
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.2/schema.json",
  "schema_version": "v2.2",
  "name_for_human": "Kolslaw Patent Tools",
  "description_for_human": "Patent prosecution tools for claim analysis, amendment conversion, and PTO compliance.",
  "functions": [
    {
      "name": "RunClaimLinter",
      "description": "Runs a full lint check on patent claims in the document. Checks antecedent basis, punctuation, claim numbering, dependency validity, § 112 issues, and formatting. Use when the user asks to check, lint, or validate claims.",
      "parameters": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "enum": ["document", "selection"],
            "description": "Whether to lint the whole document or only the selected text. Default is document.",
            "default": "document"
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": {
          "summary":    { "type": "string" },
          "issueCount": { "type": "number" },
          "issues":     { "type": "array"  }
        }
      }
    },
    {
      "name": "ConvertToUSPTO",
      "description": "Converts Word tracked changes (insertions and deletions) to USPTO amendment format: insertions become underlined, deletions become strikethrough or [[brackets]] depending on length. Use when the user asks to convert tracked changes to USPTO format, flatten redlines, or prepare amendment markup.",
      "parameters": {
        "type": "object",
        "properties": {
          "deletionStyle": {
            "type": "string",
            "enum": ["mixed", "strikethrough"],
            "description": "How to format deletions. Mixed uses brackets for short deletions (≤4 chars) and strikethrough for longer ones, per 37 CFR 1.121. Strikethrough uses strikethrough for all deletions. Default is mixed.",
            "default": "mixed"
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": { "message": { "type": "string" } }
      }
    },
    {
      "name": "ConvertToTrackChanges",
      "description": "Converts USPTO amendment markup (underlined text and strikethrough text) back into Word tracked changes. Use when the user asks to restore redlines, convert USPTO markup to track changes, or import marked-up text.",
      "parameters": { "type": "object", "properties": {} },
      "returns": {
        "type": "object",
        "properties": { "message": { "type": "string" } }
      }
    },
    {
      "name": "RunPtoCompliance",
      "description": "Counts claims and calculates USPTO fee exposure. Reports total claims, independent claims, dependent claims, cancelled claims, and any extra claim fees owed under 37 CFR 1.16. Use when the user asks about claim counts, filing fees, or PTO compliance.",
      "parameters": { "type": "object", "properties": {} },
      "returns": {
        "type": "object",
        "properties": {
          "total":               { "type": "number" },
          "independent":         { "type": "number" },
          "dependent":           { "type": "number" },
          "cancelled":           { "type": "number" },
          "extraTotal":          { "type": "number" },
          "extraIndependent":    { "type": "number" },
          "hasMultipleDependent":{ "type": "boolean" },
          "feeExposure":         { "type": "string" }
        }
      }
    },
    {
      "name": "GetClaimCount",
      "description": "Returns a quick count of total, independent, and dependent claims. Use for simple 'how many claims' questions.",
      "parameters": { "type": "object", "properties": {} },
      "returns": {
        "type": "object",
        "properties": {
          "total":       { "type": "number" },
          "independent": { "type": "number" },
          "dependent":   { "type": "number" }
        }
      }
    },
    {
      "name": "CheckAntecedentBasis",
      "description": "Checks patent claims for antecedent basis errors — instances of 'the [term]' without a prior 'a [term]' introduction. Can check all claims or a specific claim number. Use when the user asks specifically about antecedent basis.",
      "parameters": {
        "type": "object",
        "properties": {
          "claimNumber": {
            "type": "number",
            "description": "Optional. If provided, checks only this specific claim number. If omitted, checks all claims."
          }
        }
      },
      "returns": {
        "type": "object",
        "properties": {
          "issues":  { "type": "array" },
          "summary": { "type": "string" }
        }
      }
    },
    {
      "name": "GenerateResponseShell",
      "description": "Parses a USPTO Office Action from the document and generates a response shell with correct headings, status indicators, and rejection placeholders. Use when the user asks to generate an amendment, create a response template, or respond to a rejection.",
      "parameters": { "type": "object", "properties": {} },
      "returns": {
        "type": "object",
        "properties": { "message": { "type": "string" } }
      }
    },
    {
      "name": "CheckTermConsistency",
      "description": "Checks whether key terms used in the claims are used consistently throughout the specification. Flags variants and alternative phrasings. Use when the user asks about term consistency, lexicographer issues, or inconsistent terminology.",
      "parameters": { "type": "object", "properties": {} },
      "returns": {
        "type": "object",
        "properties": {
          "issues":  { "type": "array" },
          "summary": { "type": "string" }
        }
      }
    }
  ],
  "runtimes": [
    {
      "type": "LocalPlugin",
      "spec": { "url": "{{DEPLOY_URL}}/super-app/commands.html" },
      "run_for_functions": [
        "RunClaimLinter",
        "ConvertToUSPTO",
        "ConvertToTrackChanges",
        "RunPtoCompliance",
        "GetClaimCount",
        "CheckAntecedentBasis",
        "GenerateResponseShell",
        "CheckTermConsistency"
      ]
    }
  ]
}
```


### 12.6 — App Package Structure

The final app package zip (distributed to IT admins or sideloaded for testing) must contain:
```
KolslawUtensils.zip
├── appPackage/
│   ├── manifest.json
│   ├── declarativeAgent.json
│   ├── apiPlugin.json
│   ├── icon-color.png        ← 192×192px color icon
│   └── icon-outline.png      ← 32×32px monochrome outline icon
```

Add to `scripts/build.js`:
```javascript
// After building the Netlify deploy folder, also zip the app package
const { execSync } = require("child_process");
execSync("cd packages/super-app && zip -r ../../deploy/KolslawUtensils.zip appPackage/");
```

The zip file will be available at `{{DEPLOY_URL}}/KolslawUtensils.zip` for admin download.


### 12.7 — Testing the Agent

There is no unit test framework for declarative agents. Testing is entirely manual.

**Sideloading for test:**
1. In Word, go to Insert → Add-ins → Upload My Add-in → select the `appPackage/` folder
2. Wait up to 2 minutes for the add-in to register
3. Open the Copilot pane (Home → Copilot button, or the Copilot dropdown → App Skills)
4. Select the hamburger menu → find "Kolslaw Patent Assistant"
5. Use each conversation starter to verify the action fires

**Test matrix (manual, per action):**

| Utterance | Expected behavior | Pass criteria |
|---|---|---|
| "Check this document's claims for errors" | `RunClaimLinter` fires | Returns issue count; no crash |
| "Lint only claims 1 to 3" | `RunClaimLinter` with scope | Returns results scoped to selection |
| "Convert tracked changes to USPTO format" | `ConvertToUSPTO` fires | Document formatting changes visibly |
| "Use strikethrough for all deletions" | `ConvertToUSPTO` with `deletionStyle: "strikethrough"` | No bracket deletions in output |
| "How many claims do I have?" | `GetClaimCount` fires | Returns correct numbers |
| "Will I owe extra claim fees?" | `RunPtoCompliance` fires | Returns fee exposure string |
| "Check antecedent basis in claim 3" | `CheckAntecedentBasis` with `claimNumber: 3` | Scoped to claim 3 only |
| "Generate a response to this office action" | `GenerateResponseShell` fires | Shell appended to document |
| Empty document | Any action | Graceful error message, no crash |
| 200-claim document | `RunClaimLinter` | Completes within 2-minute Copilot timeout |


### 12.8 — Constraints and Known Limitations

**2-minute hard timeout.** Copilot-invoked functions have a 2-minute execution limit
enforced by the Office runtime — versus 5 minutes for taskpane-invoked functions. The
`RunClaimLinter` action on a very large document (200+ claims) is the most likely
candidate to approach this limit. If it becomes a problem, add a `maxClaims` parameter
and document the limitation to users.

**Parameters come from natural language only.** There is no UI for the Copilot
integration. If Copilot misinterprets a parameter (e.g. extracts the wrong claim number),
the user must rephrase. The `apiPlugin.json` descriptions are the primary tool for
improving extraction accuracy — keep them precise and specific.

**No Copilot license, no agent.** The taskpane tools continue to function for all users
regardless of Copilot license. The agent layer is strictly additive. Document this clearly
in the super-app README and the suite landing page (`deploy/index.html`).

**`devPreview` schema is unstable.** The unified manifest schema version used here is
`devPreview`. Microsoft may make breaking changes before GA. Monitor the Office Add-ins
changelog and update the `$schema` and `manifestVersion` properties when a stable version
is released. Pin the Agents Toolkit extension version in `.vscode/extensions.json` to
avoid unexpected schema changes during development.

**No programmatic Copilot invocation from taskpane.** There is currently no Office.js API
to open the Copilot pane, pre-populate a prompt, or send a message to Copilot from within
a taskpane's JavaScript. The integration is one-directional: Copilot → add-in only. If
Microsoft releases such an API in a future Office.js version, revisit the taskpane UI to
add "Ask Copilot" shortcut buttons next to each tool action.

---

## Cross-Cutting Concerns

### Error handling contract

All tool operations must:
1. Wrap in `runWithContext()` from `office-helpers.js`
2. Show a loading state via `setStatusLoading()` before any async operation
3. Show `setStatusSuccess()` on completion
4. Show `setStatusError()` on any caught error, with the error message
5. Never alert() or console.error() to the user directly

### Manifest URL convention

All manifests use the token `{{DEPLOY_URL}}` for the host. The build script (`scripts/build.js`) replaces this token with the actual Netlify URL at build time. Never hardcode a URL in a manifest.

### Browser compatibility

Office Add-ins run in Edge WebView2 on Windows and Safari WebKit on Mac. Both support ES2020+ natively. Do not use features beyond ES2020. No transpilation required.

### Accessibility

All taskpane UIs must:
- Use semantic HTML (buttons, not divs with click handlers)
- Include `aria-label` on icon-only buttons
- Support keyboard navigation through all interactive elements
- Maintain WCAG AA color contrast ratios (the current amber-on-navy palette passes)

---

## Testing Strategy

### Unit tests (Vitest, `packages/shared-core/`)

Every exported function in `patent-parser.js` has unit tests in `patent-parser.test.js`. Tests are run on every PR via CI. Tests must not import Office.js — `patent-parser.js` has no Office.js dependency by design.

### Integration tests (`packages/[tool]/`)

Each tool package may include an `integration.test.js` that tests the full linting/conversion pipeline using pre-built OOXML fixtures. These also run in Vitest (no Office.js needed — OOXML is just XML strings).

### Manual QA checklist (per tool, before merge)

- [ ] Opens without error in Word Desktop (Windows)
- [ ] Opens without error in Word Desktop (Mac)
- [ ] Opens without error in Word Online
- [ ] Whole Document scope operates correctly
- [ ] Selection scope operates correctly
- [ ] Empty document shows appropriate message (no crash)
- [ ] 200-claim document completes in < 3 seconds
- [ ] Status bar shows loading, then success or error
- [ ] No console errors in browser devtools

---

## Dependency Map

```
uspto-headings.js
      │
      ▼
patent-parser.js ◄──── office-helpers.js
      │                       │
      ├──► amendment-converter │
      ├──► claim-linter        │
      ├──► pto-compliance      │
      ├──► claim-charter       │
      ├──► app-generator       │
      ├──► oa-response-shell   │
      ├──► term-consistency    │
      ├──► part-number-manager │
      └──► claim-tree          │
                               │
ui-components.js ──────────────┘
      │
      ├──► (all tool taskpanes)
```

---

## Delivery Milestones

| Milestone | Contents | Gate |
|---|---|---|
| M0 — Foundation | Phase 0 complete; repo, CI, Netlify live | CI passing; deploy URL confirmed |
| M1 — Core Complete | Phase 1 complete; all shared-core functions tested | 100% test coverage on new functions |
| M2 — Amendment Converter v2 | Phase 2 complete; uses shared-core | Manual QA checklist passing |
| M3 — Claim Linter | Phase 3 complete | Manual QA passing; 0 false positives on 3 real applications |
| M4 — Compliance + Charter | Phases 4–5 complete | Manual QA passing |
| M5 — Generator + OA Shell | Phases 6–7 complete | Manual QA passing |
| M6 — Consistency + Parts | Phases 8–9 complete | Manual QA passing |
| M7 — Claim Tree | Phase 10 complete | Manual QA; drag-drop functional in all 3 environments |
| M8 — Super App | Phase 11 complete | All tools functional within super app |
| M9 — Copilot Integration | Phase 12 complete | All tools integrated into Copilot prompting |

---

*Last updated: 2026-03-02 · Maintainer: Kieran (Kolslaw) · Document version: 1.0*
