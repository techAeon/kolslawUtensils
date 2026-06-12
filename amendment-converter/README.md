# Kolslaw Utensil — TC ⇌ USPTO Markup Converter
### Word Add-in · v2.0 — Ribbon Edition

Converts between Word tracked changes and USPTO-format markup (37 CFR 1.121),
directly from ribbon buttons on the Home tab — no task pane.

- **Smart Toggle** — one click; auto-detects direction
- **Convert ▾ menu** — explicit direction + deletion style:
  - TC → USPTO (Mixed: ≤4 chars → `[[brackets]]`, longer → strikethrough)
  - TC → USPTO (Strikethrough only)
  - USPTO → Tracked Changes

**Scope is automatic**: if text is selected, only the selection is converted;
otherwise the whole document body is converted.

---

## Files

```
amendment-converter/
├── manifest.xml        ← Add-in manifest (ribbon buttons → ExecuteFunction)
├── commands.html       ← Invisible runtime page; wires ribbon buttons to handlers
├── converter-core.js   ← Pure OOXML transform logic (no Office.js; testable)
├── dialog.html         ← Small dialog used for status/error messages
├── netlify.toml        ← Netlify deploy config
├── icon-16.png         ← Ribbon icons (add these; required for production)
├── icon-32.png
└── icon-80.png
```

---

## Install Locally (Sideload for Testing)

You need the files served over HTTPS even for local dev. Easiest path:

```bash
cd amendment-converter
npx office-addin-dev-certs install          # one-time: trusted localhost certs
npx http-server . -p 5500 --ssl \
  --cert ~/.office-addin-dev-certs/localhost.crt \
  --key  ~/.office-addin-dev-certs/localhost.key
```

Then make a **local copy** of `manifest.xml` and replace every
`https://kolslaw.com/tc-converter/` with `https://localhost:5500/`.

### Sideload — Windows
1. Word → **File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs**
2. Add a network share path containing your local manifest (e.g. `\\localhost\c$\dev\manifests`), check **Show in Menu**
3. Restart Word → **Insert → My Add-ins → Shared Folder** → **Kolslaw TC Converter**

### Sideload — macOS
1. Copy the local manifest into
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/` (create `wef` if missing)
2. Restart Word → **Insert → My Add-ins** → **Kolslaw TC Converter**

The **Kolslaw** group (Smart Toggle + Convert menu) appears on the **Home** tab.

---

## Host on kolslaw.com via Netlify

1. **Create the Netlify site**
   ```bash
   cd amendment-converter
   npx netlify-cli deploy --prod
   ```
   (or in the Netlify dashboard: *Add new site → Import from Git*, set
   **Base directory** = `amendment-converter`, **Publish directory** = `amendment-converter`.)

2. **Attach the domain.** In Netlify → *Domain management → Add custom domain*:
   - Simplest: a subdomain like `tools.kolslaw.com` — add a CNAME record at your
     DNS provider pointing `tools` → `your-site.netlify.app`. Netlify
     provisions the Let's Encrypt certificate automatically.
   - If you want it under `kolslaw.com/tc-converter` and the main site is
     *also* on Netlify, just put this folder at `/tc-converter/` in that site's
     publish directory instead of making a second site.

3. **Update `manifest.xml`** so all URLs match the final hosted location
   (e.g. `https://tools.kolslaw.com/commands.html`), and add the three icon
   PNGs — production manifests fail validation without reachable icons.

4. **Validate** before distributing:
   ```bash
   npx office-addin-manifest validate manifest.xml
   ```

5. **Distribute**: sideload the production manifest per above, or for
   firm-wide/AppSource distribution upload it via the Microsoft 365 admin
   center (*Integrated apps → Upload custom app*).

> Updating later: redeploy to Netlify — Word picks up new HTML/JS on next load.
> Only manifest changes (labels, buttons, URLs) require re-sideloading and a
> `<Version>` bump.

---

## How It Works (Technical Notes)

Ribbon buttons use **`ExecuteFunction`** actions: Word loads the invisible
`commands.html` (the manifest's `FunctionFile`), which registers handlers via
`Office.actions.associate()`. Handlers read the document/selection **OOXML**,
transform it with the pure functions in `converter-core.js`, and write it back
with `insertOoxml(..., "Replace")`.

**Tracked Changes → USPTO:**
- `<w:ins>` runs → `<w:u w:val="single"/>` added, `w:ins` unwrapped
- `<w:del>` runs → `<w:delText>` promoted to `<w:t>`; short deletions (mixed
  mode, ≤4 chars) become `[[text]]`, otherwise `<w:strike/>`; `w:del` unwrapped

**USPTO → Tracked Changes:**
- Underlined runs → wrapped in `<w:ins w:author="Kolslaw" ...>`
- Struck runs → `<w:t>` → `<w:delText>`, wrapped in `<w:del>`
- `[[bracket]]` runs → brackets stripped, wrapped in `<w:del>`
- Revision IDs continue after any existing tracked-change IDs

**Limitations:**
- Pre-existing intentional underline/strikethrough formatting will be
  interpreted as USPTO markup in the USPTO→TC direction
- Table row insertions/deletions (`<w:trPr>` changes) are not handled
- Always review in Word's Track Changes view before filing

---

## Roadmap / Future Utensils

- `[ ]` Claim-number renumbering tool
- `[ ]` AIA vs. pre-AIA 112 paragraph label fixer
- `[ ]` Status-bar feedback via shared-runtime upgrade (see ROADMAP)

---

## About

**Kolslaw** is the solo IP practice of Kieran [surname].
This utensil is provided as-is for internal and client use.

Questions: kieran@kolslaw.com | kolslaw.com
