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

## Deploy so others can use it

Pick one. Both give you a stable HTTPS URL to put in `manifest.xml` and hand out.

### Option A — GitHub Pages (free, fastest, good for internal/team rollout)

This repo hosts multiple tools, so GitHub Pages' basic "deploy from branch"
mode can't be pointed at the `amendment-converter/` subfolder directly (it
only supports `/` or `/docs`). A GitHub Actions workflow is included instead
(`.github/workflows/deploy-pages.yml`) that stages just the add-in's files
and publishes them.

1. Merge this PR to `main` (the workflow triggers on pushes to `main` under
   `amendment-converter/**`).
2. In the repo: **Settings → Pages → Build and deployment → Source** →
   choose **GitHub Actions** (not "Deploy from a branch").
3. Push to `main`, or run the workflow manually from the **Actions** tab
   (`Deploy TC Converter add-in to GitHub Pages → Run workflow`).
4. Your add-in is now live at `https://techaeon.github.io/kolslawUtensils/`.
   `manifest.github.xml` is already wired to that URL — sideload it the
   same way as `manifest.localhost.xml` above (Word on the web: My
   Add-ins → Upload My Add-in; desktop: trusted catalog or
   `office-addin-debugging start`).
5. Hand `manifest.github.xml` to anyone who needs the add-in — they
   sideload it the same way you did.

**Limitation:** GitHub Pages has no access control by default (repo can be
public or the Pages site can be unlisted, but it's not authenticated).
Fine for internal sharing; not appropriate if the add-in should be gated
to specific users — use Option B or AppSource distribution for that.

### Option B — Netlify → kolslaw.com (custom domain, production-grade)

1. In Netlify: **Add new site → Import from Git**, pick this repo.
   - Base directory: `amendment-converter`
   - Publish directory: `amendment-converter` (`netlify.toml` handles headers)
   - Build command: *(none)*
2. In Netlify **Domain settings**, add the custom domain:
   - simplest: a subdomain like `tc-converter.kolslaw.com`, then update all
     URLs in `manifest.xml` to match, or
   - keep `kolslaw.com/tc-converter/` via a proxy redirect on the main site:
     ```toml
     [[redirects]]
       from = "/tc-converter/*"
       to = "https://<your-netlify-site>.netlify.app/:splat"
       status = 200
     ```
3. Add icon files (`icon-16.png`, `icon-32.png`, `icon-80.png`) to this folder
   — **required** for both sideloading polish and AppSource submission.
4. Validate:
   ```bash
   npm run validate
   ```
5. Sideload `manifest.xml`, or push it to your org via the Microsoft 365
   admin center (**Integrated Apps**) — see below for private org-wide
   distribution vs. public AppSource listing.

---

## Publish to the Microsoft Office Add-in Store (AppSource)

Two distinct audiences — pick based on who needs this:

### Just your firm / org (no public store, fastest, no review)

If this is only for your firm, skip AppSource entirely:

1. Host the add-in (Option A or B above) — production hosting is required
   either way, this isn't unique to the store.
2. Microsoft 365 admin center → **Settings → Integrated apps** → **Upload
   custom apps** → upload `manifest.xml`.
3. Assign to specific users/groups or the whole org.
4. Done — no Microsoft review, live within minutes, private to your tenant.

### Public AppSource listing (anyone can install it)

This *does* go through Microsoft review. Steps:

1. **Production hosting is mandatory** — AppSource will reject anything
   pointing at localhost or an unverified domain. Netlify+custom-domain
   (Option B) or a permanent GitHub Pages URL both qualify; a custom
   domain you control looks more credible to reviewers and to end users.
2. **Assets you'll need beyond the manifest:**
   - Icons: 20×20, 40×40, 96×96 px minimum (the manifest's 16/32/80 cover
     ribbon UI, but Partner Center wants its own store-listing icon set)
   - 1–5 screenshots (1366×768 recommended) showing the ribbon and a
     dialog in use
   - A **privacy policy URL** (required even for simple tools — must state
     what data leaves the user's machine; for this add-in, honestly:
     none, all conversion is local, so this is an easy policy to write)
   - A **support/contact URL**
   - Short (< 100 char) and long descriptions, a category
     (Productivity → Legal, if available)
3. **Validate the manifest against AppSource rules specifically**
   (stricter than plain schema validation):
   ```bash
   npx office-addin-manifest validate manifest.xml
   ```
   Also run it through the [Office Add-in Validator](https://appsource.microsoft.com/marketplace/partner-dashboard) —
   Partner Center runs an automated check on submission that catches things
   like missing `SupportUrl`, oversized tooltips, or icon-size mismatches.
4. **Create a Microsoft Partner Center account** (partner.microsoft.com) —
   free, but requires business verification (company name, address, and a
   Microsoft account with MFA). This step alone can take a few business
   days if your organization hasn't been verified with Microsoft before.
5. **Submit via Partner Center → Office Store**: new offer → upload
   manifest + assets from step 2 → submit for certification.
6. **Certification review**: typically 3–7 business days. Common rejection
   reasons worth avoiding up front: broken/placeholder icon URLs, an
   add-in that doesn't function on first load (they will actually click
   every button), missing privacy policy, or a manifest `Id` GUID that's
   already registered to another submission (this is why each manifest
   variant in this repo has its own GUID — **use `manifest.xml`'s GUID,
   unchanged, for the real submission**; don't reuse the localhost/GitHub
   Pages dev GUIDs).
7. Once approved, it's discoverable in Word's **Insert → Get Add-ins →
   Store** search for anyone, worldwide, and updates you push (new
   `<Version>` + resubmission) roll out automatically to installed users.

**My recommendation:** given this is a patent-prosecution tool for one
firm's workflow, the "Integrated Apps" private-org route (above) gets you
running today with zero review overhead. AppSource is worth the ~1–2 week
process only if you want this discoverable by outside firms.

---

## Files

```
manifest.xml             production manifest (kolslaw.com URLs) — use this GUID for AppSource
manifest.github.xml      GitHub Pages manifest (techaeon.github.io URL, separate ID)
manifest.localhost.xml   dev manifest (https://localhost:3000, separate ID)
manifest.http.xml        dev manifest, no-cert HTTP variant (http://localhost:3000, separate ID)
commands.html            invisible FunctionFile — loads commands.bundle.js as a classic script
commands.src.js          FunctionFile handler source (ES module — imports converter-core etc.)
commands.bundle.js       built by `npm run build`; gitignored, NOT committed — see note below
dialog.html              multi-view dialog (toast / markdown / remarks / summary / settings)
converter-core.js        pure OOXML transforms (TC ⇌ USPTO, accept markup)
claim-utils.js           change summary, status identifiers, clean/allowed claim sets
ep-to-us-converter.js    EP → US conversion + draft Remarks generation
netlify.toml             Netlify headers/publish config
../.github/workflows/deploy-pages.yml   builds/publishes to GitHub Pages on push to main
test/                    vitest suite (180 tests)
```

## Development

```bash
npm test          # run the full suite once
npm run test:watch
```

The transform logic is pure ES modules with no Office.js dependency, so all
conversion behavior is unit-tested headlessly (vitest + happy-dom).

### Why `commands.bundle.js` exists (read this before editing `commands.src.js`)

`commands.html` — the invisible FunctionFile page ribbon buttons call into —
loads a **single classic `<script>`**, not an ES module. This is deliberate:
our manifest doesn't declare a Shared Runtime (`<Runtimes>` /
`VersionOverridesV1_1`), and without one, some Word builds execute the
ribbon-command FunctionFile in a more restricted JS engine that doesn't
reliably support native `import`/`export`. Symptom if you skip this: buttons
appear to work intermittently, then Word throws
*"ADD-IN ERROR — This add-in could not be started."*

So the actual handler code lives in **`commands.src.js`** (an ES module,
same as the rest of the codebase — imports `converter-core.js`, etc.), and
`npm run build` (esbuild) bundles it into **`commands.bundle.js`**: a single
file with zero `import`/`export` statements, which any Office JS runtime can
execute.

**`commands.bundle.js` is gitignored — it is never committed.** It's
regenerated by:
- `npm run build` — one-time build
- `npm run build:watch` — rebuilds on save while you're actively editing
- automatically before `npm run dev` / `npm run dev:http` (wired via
  `predev` / `predev:http` npm hooks)
- the GitHub Pages workflow, before publishing

**If you edit `commands.src.js`, `converter-core.js`, `claim-utils.js`, or
`ep-to-us-converter.js` while the dev server is already running**, run
`npm run build` again (or keep `npm run build:watch` running in a second
terminal) and reload the add-in in Word — editing those files alone does
**not** change what the ribbon buttons execute until the bundle is rebuilt.
