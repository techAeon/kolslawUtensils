"use strict";

// ════════════════════════════════════════════════════════════════════════════
// Kolslaw TC ⇌ USPTO Converter — core transforms (UI-free)
// Shared by the ribbon command runtime (commands.html). Pure functions over
// OOXML strings/DOM; no Office.js dependencies, so this file is unit-testable
// in Node with a DOM shim.
// ════════════════════════════════════════════════════════════════════════════

const SHORT_TEXT_LIMIT = 4; // ≤4 chars → [[brackets]] per 37 CFR 1.121 practice
const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function parse(xmlStr) {
  return new DOMParser().parseFromString(xmlStr, "application/xml");
}

function serialize(xmlDoc) {
  return new XMLSerializer().serializeToString(xmlDoc);
}

// ── Detection ───────────────────────────────────────────────────────────────

function hasTrackedChanges(xmlDoc) {
  return xmlDoc.getElementsByTagNameNS(NS, "ins").length > 0 ||
         xmlDoc.getElementsByTagNameNS(NS, "del").length > 0;
}

function hasUsptoCues(xmlDoc) {
  for (const run of Array.from(xmlDoc.getElementsByTagNameNS(NS, "r"))) {
    if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;
    const text = runText(run, "t");
    if (/\[\[.*\]\]/.test(text)) return true;
    const rPr = firstChildNS(run, "rPr");
    if (!rPr) continue;
    const hasU = Array.from(rPr.getElementsByTagNameNS(NS, "u"))
      .some(u => u.getAttributeNS(NS, "val") !== "none" && u.getAttribute("w:val") !== "none");
    const hasSt = rPr.getElementsByTagNameNS(NS, "strike").length > 0 ||
                  rPr.getElementsByTagNameNS(NS, "dstrike").length > 0;
    if (hasU || hasSt) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFORM 1: Tracked Changes → USPTO markup
//   Deletions: mixed mode + total text ≤ SHORT_TEXT_LIMIT → [[brackets]]
//              otherwise → strikethrough; <w:del> unwrapped either way
//   Insertions: underline; <w:ins> unwrapped
// ════════════════════════════════════════════════════════════════════════════
function applyTcToUsptoTransform(xmlDoc, delStyle) {
  for (const del of Array.from(xmlDoc.getElementsByTagNameNS(NS, "del"))) {
    const fullText = runText(del, "delText");
    const useBrackets = delStyle === "mixed" && fullText.length <= SHORT_TEXT_LIMIT;
    const runs = Array.from(del.getElementsByTagNameNS(NS, "r"));

    for (const run of runs) promoteDelText(xmlDoc, run);

    if (useBrackets && runs.length > 0) {
      const firstT = runs[0].getElementsByTagNameNS(NS, "t")[0];
      if (firstT) {
        firstT.textContent = "[[" + fullText + "]]";
        firstT.setAttribute("xml:space", "preserve");
      }
      stripRunProps(runs[0], ["strike", "dstrike", "u"]);
      for (let i = 1; i < runs.length; i++) runs[i].parentNode.removeChild(runs[i]);
    } else {
      for (const run of runs) {
        ensureRpr(xmlDoc, run);
        stripRunProps(run, ["u", "strike"]);
        firstChildNS(run, "rPr").appendChild(xmlDoc.createElementNS(NS, "w:strike"));
      }
    }
    unwrapNode(del);
  }

  for (const ins of Array.from(xmlDoc.getElementsByTagNameNS(NS, "ins"))) {
    for (const run of Array.from(ins.getElementsByTagNameNS(NS, "r"))) {
      ensureRpr(xmlDoc, run);
      stripRunProps(run, ["strike"]);
      addFormattingOnce(xmlDoc, run, "u", { "w:val": "single" });
    }
    unwrapNode(ins);
  }

  return serialize(xmlDoc);
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFORM 2: USPTO markup → Tracked Changes
//   underlined runs → <w:ins>; struck runs → <w:del>; [[bracket]] runs → <w:del>
//   Candidates are collected first, then applied bottom-up.
// ════════════════════════════════════════════════════════════════════════════
function applyUsptoToTcTransform(xmlDoc) {
  const author = "Kolslaw";
  const date = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let id = maxExistingId(xmlDoc) + 1;

  const candidates = [];
  for (const run of Array.from(xmlDoc.getElementsByTagNameNS(NS, "r"))) {
    if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;

    const text = runText(run, "t");
    if (/^\[\[.*\]\]$/.test(text)) {
      candidates.push({ run, type: "bracket", text });
      continue;
    }
    const rPr = firstChildNS(run, "rPr");
    if (!rPr) continue;

    const hasU = Array.from(rPr.getElementsByTagNameNS(NS, "u"))
      .some(u => u.getAttributeNS(NS, "val") !== "none" && u.getAttribute("w:val") !== "none");
    const hasSt = rPr.getElementsByTagNameNS(NS, "strike").length > 0 ||
                  rPr.getElementsByTagNameNS(NS, "dstrike").length > 0;

    if (hasU) candidates.push({ run, type: "insertion" });
    else if (hasSt) candidates.push({ run, type: "deletion" });
  }

  candidates.reverse(); // bottom-up so wrapping never disturbs unprocessed runs

  for (const { run, type, text } of candidates) {
    if (type === "insertion") {
      stripRunProps(run, ["u"]);
      wrapRun(xmlDoc, run, "ins", author, date, id++);

    } else if (type === "deletion") {
      stripRunProps(run, ["strike", "dstrike"]);
      for (const t of Array.from(run.getElementsByTagNameNS(NS, "t"))) {
        const dt = xmlDoc.createElementNS(NS, "w:delText");
        if (t.getAttribute("xml:space")) dt.setAttribute("xml:space", "preserve");
        dt.textContent = t.textContent;
        t.parentNode.replaceChild(dt, t);
      }
      wrapRun(xmlDoc, run, "del", author, date, id++);

    } else { // bracket
      const inner = text.slice(2, -2);
      const tEls = Array.from(run.getElementsByTagNameNS(NS, "t"));
      if (tEls.length > 0) {
        const dt = xmlDoc.createElementNS(NS, "w:delText");
        if (/^\s|\s$/.test(inner)) dt.setAttribute("xml:space", "preserve");
        dt.textContent = inner;
        tEls.forEach((t, i) => i === 0 ? t.parentNode.replaceChild(dt, t) : t.parentNode.removeChild(t));
      }
      stripRunProps(run, ["u", "strike"]);
      wrapRun(xmlDoc, run, "del", author, date, id++);
    }
  }

  return serialize(xmlDoc);
}

// ── XML utilities ───────────────────────────────────────────────────────────

function runText(scope, localName) {
  return Array.from(scope.getElementsByTagNameNS(NS, localName))
    .map(n => n.textContent).join("");
}

function firstChildNS(el, localName) {
  return el.getElementsByTagNameNS(NS, localName)[0] || null;
}

// Convert every <w:delText> in a run to <w:t>, preserving significant whitespace
function promoteDelText(xmlDoc, run) {
  for (const dt of Array.from(run.getElementsByTagNameNS(NS, "delText"))) {
    const t = xmlDoc.createElementNS(NS, "w:t");
    if (/^\s|\s$/.test(dt.textContent)) t.setAttribute("xml:space", "preserve");
    t.textContent = dt.textContent;
    dt.parentNode.replaceChild(t, dt);
  }
}

function stripRunProps(run, localNames) {
  const rPr = firstChildNS(run, "rPr");
  if (!rPr) return;
  for (const name of localNames) {
    for (const n of Array.from(rPr.getElementsByTagNameNS(NS, name))) rPr.removeChild(n);
  }
}

function ensureRpr(xmlDoc, run) {
  if (!firstChildNS(run, "rPr")) {
    run.insertBefore(xmlDoc.createElementNS(NS, "w:rPr"), run.firstChild);
  }
}

function addFormattingOnce(xmlDoc, run, localName, attrs) {
  const rPr = firstChildNS(run, "rPr");
  if (!rPr || rPr.getElementsByTagNameNS(NS, localName).length) return;
  const el = xmlDoc.createElementNS(NS, "w:" + localName);
  for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(NS, k, v);
  rPr.appendChild(el);
}

function unwrapNode(el) {
  const p = el.parentNode;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  p.removeChild(el);
}

function wrapRun(xmlDoc, run, tag, author, date, id) {
  const w = xmlDoc.createElementNS(NS, "w:" + tag);
  w.setAttributeNS(NS, "w:id", String(id));
  w.setAttributeNS(NS, "w:author", author);
  w.setAttributeNS(NS, "w:date", date);
  run.parentNode.insertBefore(w, run);
  w.appendChild(run);
}

function ancestorOf(el, localName) {
  for (let node = el.parentNode; node; node = node.parentNode) {
    if (node.localName === localName && node.namespaceURI === NS) return true;
  }
  return false;
}

function maxExistingId(xmlDoc) {
  let max = 0;
  for (const tag of ["ins", "del"]) {
    for (const el of Array.from(xmlDoc.getElementsByTagNameNS(NS, tag))) {
      const v = el.getAttributeNS(NS, "id") || el.getAttribute("w:id") || "0";
      max = Math.max(max, parseInt(v, 10) || 0);
    }
  }
  return max;
}
