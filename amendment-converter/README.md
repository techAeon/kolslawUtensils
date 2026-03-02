# Kolslaw Utensil — TC ⇌ USPTO Markup Converter
### Word Add-in · v1.0

Converts between Word tracked changes and USPTO-format markup (37 CFR 1.121):
- **Tracked Changes → USPTO Markup**: insertions underlined, deletions struck through
- **USPTO Markup → Tracked Changes**: reverse the process on any received marked-up document

---

## Files

```
kolslaw-tc-converter/
├── manifest.xml      ← Add-in manifest (tells Word where to find the add-in)
├── taskpane.html     ← The entire add-in UI + logic (host this file)
├── icon-16.png       ← Toolbar icon (create/add; optional for dev)
├── icon-32.png
├── icon-80.png
└── README.md
```

---

## Quick Start — Local Dev (Recommended for Testing)

### Option A: VSCode + Live Server (easiest)

1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VSCode
2. Open the `kolslaw-tc-converter/` folder in VSCode
3. Right-click `taskpane.html` → **Open with Live Server**
   - It will serve at `https://localhost:5500/taskpane.html` (or `http://`)
4. In `manifest.xml`, replace every `https://YOUR-HOST/kolslaw-tc-converter/` with `http://localhost:5500/`
5. Sideload the manifest (see below)

### Option B: npx http-server (no install needed)

```bash
cd kolslaw-tc-converter
npx http-server . -p 5500 --cors
```

Then update manifest URLs to `http://localhost:5500/`.

> **HTTPS note**: Office Online requires HTTPS even locally.  
> For local HTTPS, use [office-addin-dev-certs](https://www.npmjs.com/package/office-addin-dev-certs):
> ```bash
> npx office-addin-dev-certs install
> npx http-server . -p 5500 --ssl --cert ~/.office-addin-dev-certs/localhost.crt --key ~/.office-addin-dev-certs/localhost.key
> ```

---

## Sideloading the Add-in (Desktop Word)

### Windows
1. Open Word → **File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs**
2. Add a new catalog path pointing to the folder containing `manifest.xml`
3. Check **Show in Menu**
4. Restart Word
5. **Insert → My Add-ins → Shared Folder** → select **Kolslaw TC Converter**

### macOS
1. Open the Finder and navigate to:  
   `/Users/<username>/Library/Containers/com.microsoft.Word/Data/Documents/wef/`  
   (Create the `wef` folder if it doesn't exist)
2. Copy `manifest.xml` into that folder
3. Open Word → **Insert → My Add-ins** → find **Kolslaw TC Converter**

---

## Production Deployment

1. Host `taskpane.html` (and icon PNGs) on any HTTPS server:
   - GitHub Pages, Netlify, Vercel, or your own domain
   - Example: `https://tools.kolslaw.com/tc-converter/taskpane.html`
2. Replace all `https://YOUR-HOST/kolslaw-tc-converter/` references in `manifest.xml`
3. For AppSource distribution (optional), submit `manifest.xml` to Microsoft's Partner Center

---

## How It Works (Technical Notes)

The add-in uses **Office.js WordApi 1.3+** and manipulates the document's **OOXML** directly via `body.ooxml`.

**Tracked Changes → USPTO:**
- Finds all `<w:ins>` elements → adds `<w:u w:val="single"/>` to each run → unwraps the `w:ins`
- Finds all `<w:del>` elements → converts `<w:delText>` → `<w:t>`, adds `<w:strike/>` → unwraps `w:del`

**USPTO → Tracked Changes:**
- Finds runs with `<w:u>` (non-"none") → wraps in `<w:ins w:author="Kolslaw" ...>`
- Finds runs with `<w:strike>` or `<w:dstrike>` → converts `<w:t>` → `<w:delText>`, wraps in `<w:del ...>`
- IDs are assigned sequentially, picking up after any existing tracked-change IDs

**Limitations:**
- Complex runs spanning multiple formatting segments may need a manual review pass
- Table cell insertions/deletions (`<w:trPr>` changes) are not handled — only text run-level changes
- After USPTO→TC conversion, review the document in Word's Track Changes view before filing

---

## Roadmap / Future Utensils

- `[ ]` Bracket-style USPTO markup `[[deleted]]` as alternative deletion format
- `[ ]` Selection-only conversion (operate on highlighted text, not whole document)
- `[ ]` Claim-number renumbering tool
- `[ ]` AIA vs. pre-AIA 112 paragraph label fixer

---

## About

**Kolslaw** is the solo IP practice of Kieran [surname].  
This utensil is provided as-is for internal and client use.

Questions: kieran@kolslaw.com | kolslaw.com
