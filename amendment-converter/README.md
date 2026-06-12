# Kolslaw Utensil — TC ⇌ USPTO Markup Converter
### Word Add-in · v2.1 — Ribbon Edition

A ribbon-only Word add-in (no task pane) for patent prosecution:

- **Convert ▾** — TC ⇌ USPTO markup (37 CFR 1.121)
  - *Auto Detect* — one click; detects direction from document content
  - *TC → USPTO (Mixed)* — deletions ≤ 4 chars → `[[brackets]]`, longer → ~~strikethrough~~
  - *TC → USPTO (Strike)* — all deletions → strikethrough
  - *USPTO → Tracked Changes* — converts markup back to Word tracked changes
- **Copy with Markup** — Markdown export (`**bold**` insertions, `~~strike~~` deletions) with one-click copy
- **New Claim Set ▾**
  - *Clean Claim Set* — accepts all markup → new document, statuses updated, cancelled claims stay in place as `N. (Cancelled)`
  - *Allowed Claim Set* — same, but all non-cancelled claims become `(Allowed)`
  - *EP → US Amendment* — converts an EP claim set to US preliminary-amendment format: strips reference numerals, resolves multiple dependencies, adds `non-transitory` (citing 1337 O.G. 88), flags `characterized in that` and optional language (`preferably` etc., § 112(b)/MPEP 2173.05(d)), and generates draft Remarks with 37 CFR fee warnings
- **Settings ▾** — per-claim Change Summary table; deletion-style preference

**Scope is automatic** for Convert commands: selection if text is selected,
otherwise the whole document body. Claim-set commands always read the whole document.

---

## Try it out locally (5 minutes)

Requires Word for Windows/Mac (Microsoft 365) or Word on the web, plus Node 18+.

```bash
cd amendment-converter
npm install

# 1. Install the localhost HTTPS dev certificate (one-time; needs admin/sudo)
npm run certs

# 2. Serve this folder at https://localhost:3000
npm run dev
```

Then sideload `manifest.localhost.xml`:

- **Word on the web** — open a document → *Home → Add-ins → More Add-ins →
  My Add-ins → Upload My Add-in* → pick `manifest.localhost.xml`.
- **Word for Windows** — easiest via the CLI:
  ```bash
  npx office-addin-debugging start manifest.localhost.xml desktop
  ```
  (or share the folder and add it as a trusted catalog under
  *File → Options → Trust Center → Trusted Add-in Catalogs*).
- **Word for Mac** — copy `manifest.localhost.xml` to
  `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/` and restart Word.

A **Kolslaw** group appears on the **Home** tab.

### Locked-down work PC? (no admin / cert install blocked)

Desktop Word accepts plain `http://localhost` for development sideloading,
so you can skip the certificate step entirely:

```bash
npm run dev:http     # serves at http://localhost:3000, no certs needed
```

Then sideload **`manifest.http.xml`** instead, via the trusted-catalog method:

1. Create a folder, e.g. `C:\addin-catalog`, copy `manifest.http.xml` into it,
   and share it with yourself: right-click → *Properties → Sharing → Share* →
   note the `\\YOURPC\addin-catalog` network path.
2. In Word: *File → Options → Trust Center → Trust Center Settings →
   Trusted Add-in Catalogs* → paste the network path → check *Show in Menu* → OK.
3. Restart Word → *Home → Add-ins → More Add-ins → Shared Folder* → select the add-in.

Note: the HTTP manifest works in **desktop Word only** — Word on the web is
served over HTTPS and will block plain-HTTP add-in content.

### Quick smoke test

1. Type a sentence, turn on **Track Changes** (Review tab), edit a few words.
2. *Kolslaw → Convert ▾ → Auto Detect* — tracked changes become underline/strikethrough/brackets.
3. Click *Auto Detect* again — markup converts back to tracked changes.
4. Paste a numbered claim set (`1. A device comprising...`) and try
   *New Claim Set ▾ → Clean Claim Set* — a new document opens with clean claims.
5. Paste an EP-style claim set (with reference numerals like `(10)` and
   `claims 1-3` dependencies) and try *EP → US Amendment* — a new document
   opens and the draft Remarks appear in a dialog.

---

## Deploy to kolslaw.com via Netlify

1. Push this repo to GitHub (already done if you're reading this there).
2. In Netlify: **Add new site → Import from Git**, pick the repo.
   - Base directory: `amendment-converter`
   - Publish directory: `amendment-converter` (the included `netlify.toml` handles headers)
   - Build command: *(none)*
3. In Netlify **Domain settings**, add the custom domain and set up the
   `kolslaw.com/tc-converter/*` path. Two options:
   - simplest: deploy to a subdomain like `tc-converter.kolslaw.com` and update
     all URLs in `manifest.xml` to match, or
   - keep `kolslaw.com/tc-converter/` by adding a proxy redirect on the main
     kolslaw.com site:
     ```toml
     [[redirects]]
       from = "/tc-converter/*"
       to = "https://<your-netlify-site>.netlify.app/:splat"
       status = 200
     ```
4. Add icon files (`icon-16.png`, `icon-32.png`, `icon-80.png`) to this folder.
5. Validate and distribute the production manifest:
   ```bash
   npm run validate
   ```
   Then sideload `manifest.xml` the same way as above, or distribute it via
   the Microsoft 365 admin center (Integrated Apps) for your organization.

---

## Files

```
manifest.xml             production manifest (kolslaw.com URLs)
manifest.localhost.xml   dev manifest (https://localhost:3000, separate ID)
commands.html            invisible FunctionFile — all ribbon command handlers
dialog.html              multi-view dialog (toast / markdown / remarks / summary / settings)
converter-core.js        pure OOXML transforms (TC ⇌ USPTO, accept markup)
claim-utils.js           change summary, status identifiers, clean/allowed claim sets
ep-to-us-converter.js    EP → US conversion + draft Remarks generation
netlify.toml             Netlify headers/publish config
test/                    vitest suite (180 tests)
```

## Development

```bash
npm test          # run the full suite once
npm run test:watch
```

The transform logic is pure ES modules with no Office.js dependency, so all
conversion behavior is unit-tested headlessly (vitest + happy-dom).
