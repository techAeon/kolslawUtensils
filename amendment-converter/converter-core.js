"use strict";

// ════════════════════════════════════════════════════════════════════════════
// Kolslaw TC ⇌ USPTO Converter — OOXML transform core
//
// Pure functions over OOXML DOM; no Office.js dependency.
// ════════════════════════════════════════════════════════════════════════════

const SHORT_TEXT_LIMIT = 4;
const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ── Parse / serialize ────────────────────────────────────────────────────────

function parse(xmlStr) {
  return new DOMParser().parseFromString(xmlStr, "application/xml");
}
function serialize(xmlDoc) {
  return new XMLSerializer().serializeToString(xmlDoc);
}

// ── DOM utilities ─────────────────────────────────────────────────────────────
// happy-dom v20 has a broken getElementsByTagNameNS that returns empty results
// for namespace-prefixed elements in XMLDocuments parsed by DOMParser.
// We work around this uniformly: localName-based tree walks everywhere.

function elemChildren(el) {
  return Array.from(el.childNodes).filter(n => n.nodeType === 1);
}

// First direct-child element with the given local name (namespace-agnostic).
function firstChild(el, localName) {
  for (const child of el.childNodes) {
    if (child.nodeType === 1 && child.localName === localName) return child;
  }
  return null;
}

// All direct-child elements with the given local name.
function childrenNamed(el, localName) {
  return elemChildren(el).filter(c => c.localName === localName);
}

// All descendant elements with the given local name (replaces getElementsByTagNameNS).
function allNamed(el, localName) {
  return Array.from(el.getElementsByTagName("*")).filter(n => n.localName === localName);
}

// ── Detection ────────────────────────────────────────────────────────────────

function hasTrackedChanges(xmlDoc) {
  return allNamed(xmlDoc, "ins").length > 0 ||
    allNamed(xmlDoc, "del").length > 0;
}

function hasUsptoCues(xmlDoc) {
  for (const run of allNamed(xmlDoc, "r")) {
    if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;
    const text = collectText(run, "t");
    if (/\[\[.*?\]\]/.test(text)) return true;
    const rPr = firstChild(run, "rPr");
    if (!rPr) continue;
    const uEls = childrenNamed(rPr, "u");
    if (uEls.some(u => uVal(u) !== "none")) return true;
    if (childrenNamed(rPr, "strike").length > 0) return true;
    if (childrenNamed(rPr, "dstrike").length > 0) return true;
  }
  return false;
}

function hasMixedFormats(xmlDoc) {
  return hasTrackedChanges(xmlDoc) && hasUsptoCues(xmlDoc);
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFORM 1: Tracked Changes → USPTO markup
// ════════════════════════════════════════════════════════════════════════════

function applyTcToUsptoTransform(xmlDoc, delStyle) {
  for (const del of allNamed(xmlDoc, "del")) {
    const fullText = collectText(del, "delText");
    const useBrackets = delStyle === "mixed" && fullText.length <= SHORT_TEXT_LIMIT;
    const runs = allNamed(del, "r");

    for (const run of runs) promoteDelText(xmlDoc, run);

    if (useBrackets && runs.length > 0) {
      const firstT = firstChild(runs[0], "t");
      if (firstT) {
        firstT.textContent = "[[" + fullText + "]]";
        firstT.setAttribute("xml:space", "preserve");
      }
      stripRpr(runs[0], ["strike", "dstrike", "u"]);
      for (let i = 1; i < runs.length; i++) runs[i].parentNode.removeChild(runs[i]);
    } else {
      for (const run of runs) {
        ensureRpr(xmlDoc, run);
        stripRpr(run, ["u", "strike", "dstrike"]);
        firstChild(run, "rPr").appendChild(xmlDoc.createElementNS(NS, "w:strike"));
      }
    }
    unwrap(del);
  }

  for (const ins of allNamed(xmlDoc, "ins")) {
    for (const run of allNamed(ins, "r")) {
      ensureRpr(xmlDoc, run);
      stripRpr(run, ["strike", "dstrike"]);
      addOnce(xmlDoc, run, "u", "single");
    }
    unwrap(ins);
  }

  return serialize(xmlDoc);
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFORM 2: USPTO markup → Tracked Changes
// ════════════════════════════════════════════════════════════════════════════

function applyUsptoToTcTransform(xmlDoc) {
  const author = "Kolslaw";
  const date = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let id = maxId(xmlDoc) + 1;

  const candidates = [];
  for (const run of allNamed(xmlDoc, "r")) {
    if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;
    const text = collectText(run, "t");

    if (/^\[\[[\s\S]*?\]\]$/.test(text)) {
      candidates.push({ run, type: "bracket", text });
      continue;
    }
    const rPr = firstChild(run, "rPr");
    if (!rPr) continue;

    const uEls = childrenNamed(rPr, "u").filter(u => uVal(u) !== "none");
    const hasSt = childrenNamed(rPr, "strike").length > 0 ||
                  childrenNamed(rPr, "dstrike").length > 0;

    if (uEls.length > 0) candidates.push({ run, type: "insertion" });
    else if (hasSt) candidates.push({ run, type: "deletion" });
  }

  candidates.reverse();

  for (const { run, type, text } of candidates) {
    if (type === "insertion") {
      stripRpr(run, ["u"]);
      wrapRun(xmlDoc, run, "ins", author, date, id++);

    } else if (type === "deletion") {
      stripRpr(run, ["strike", "dstrike"]);
      for (const t of childrenNamed(run, "t")) {
        const dt = xmlDoc.createElementNS(NS, "w:delText");
        if (t.getAttribute("xml:space")) dt.setAttribute("xml:space", "preserve");
        dt.textContent = t.textContent;
        t.parentNode.replaceChild(dt, t);
      }
      wrapRun(xmlDoc, run, "del", author, date, id++);

    } else { // bracket
      const inner = text.replace(/^\[\[/, "").replace(/\]\]$/, "");
      const tEls = childrenNamed(run, "t");
      if (tEls.length > 0) {
        const dt = xmlDoc.createElementNS(NS, "w:delText");
        if (/^\s|\s$/.test(inner)) dt.setAttribute("xml:space", "preserve");
        dt.textContent = inner;
        tEls[0].parentNode.replaceChild(dt, tEls[0]);
        for (let i = 1; i < tEls.length; i++) tEls[i].parentNode.removeChild(tEls[i]);
      }
      stripRpr(run, ["u", "strike", "dstrike"]);
      wrapRun(xmlDoc, run, "del", author, date, id++);
    }
  }

  return serialize(xmlDoc);
}

// ════════════════════════════════════════════════════════════════════════════
// ACCEPT USPTO MARKUP  (USPTO → clean final text)
// ════════════════════════════════════════════════════════════════════════════

function acceptUsptMarkup(xmlDoc) {
  for (const run of allNamed(xmlDoc, "r")) {
    if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;
    const text = collectText(run, "t");

    if (/^\[\[[\s\S]*?\]\]$/.test(text)) {
      run.parentNode.removeChild(run);
      continue;
    }
    // Strip embedded [[...]] brackets from within run text
    if (/\[\[[\s\S]*?\]\]/.test(text)) {
      for (const t of childrenNamed(run, "t")) {
        t.textContent = t.textContent.replace(/\[\[[\s\S]*?\]\]/g, "");
      }
      continue;
    }

    const rPr = firstChild(run, "rPr");
    if (!rPr) continue;

    const hasU = childrenNamed(rPr, "u").some(u => uVal(u) !== "none");
    const hasSt = childrenNamed(rPr, "strike").length > 0 ||
                  childrenNamed(rPr, "dstrike").length > 0;

    if (hasSt) {
      run.parentNode.removeChild(run);
    } else if (hasU) {
      stripRpr(run, ["u"]);
    }
  }
  return serialize(xmlDoc);
}

// ════════════════════════════════════════════════════════════════════════════
// STATUS IDENTIFIER HELPERS
// ════════════════════════════════════════════════════════════════════════════

function parseClaimHeader(paraText) {
  const m = paraText.match(/^(\d+)\.\s+(?:\(([^)]+)\)\s+)?/);
  if (!m) return null;
  return {
    number: parseInt(m[1], 10),
    status: m[2] ? m[2].trim() : null,
    bodyStart: m[0].length,
  };
}

function canonicalStatus(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (/^cancel/i.test(s)) return "Cancelled";
  if (/^currently/i.test(s)) return "Currently Amended";
  if (/^previously/i.test(s)) return "Previously Presented";
  if (/^original/i.test(s)) return "Original";
  if (/^new$/i.test(s)) return "New";
  if (/^allowed|allowable/i.test(s)) return "Allowed";
  if (/^withdrawn/i.test(s)) return "Withdrawn";
  if (/^not\s+entered/i.test(s)) return "Not Entered";
  return s;
}

// ── Utility functions ─────────────────────────────────────────────────────────

// Collect all text content from elements with the given local name (any depth)
function collectText(scope, localName) {
  return allNamed(scope, localName).map(n => n.textContent).join("");
}

function promoteDelText(xmlDoc, run) {
  for (const dt of childrenNamed(run, "delText")) {
    const t = xmlDoc.createElementNS(NS, "w:t");
    if (/^\s|\s$/.test(dt.textContent)) t.setAttribute("xml:space", "preserve");
    t.textContent = dt.textContent;
    dt.parentNode.replaceChild(t, dt);
  }
}

function stripRpr(run, localNames) {
  const rPr = firstChild(run, "rPr");
  if (!rPr) return;
  for (const name of localNames) {
    for (const n of childrenNamed(rPr, name)) rPr.removeChild(n);
  }
}

function ensureRpr(xmlDoc, run) {
  if (!firstChild(run, "rPr")) run.insertBefore(xmlDoc.createElementNS(NS, "w:rPr"), run.firstChild);
}

function addOnce(xmlDoc, run, localName, val) {
  const rPr = firstChild(run, "rPr");
  if (!rPr || childrenNamed(rPr, localName).length) return;
  const el = xmlDoc.createElementNS(NS, "w:" + localName);
  el.setAttribute("w:val", val);
  rPr.appendChild(el);
}

function unwrap(el) {
  const p = el.parentNode;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  p.removeChild(el);
}

function wrapRun(xmlDoc, run, tag, author, date, id) {
  const w = xmlDoc.createElementNS(NS, "w:" + tag);
  w.setAttribute("w:id", String(id));
  w.setAttribute("w:author", author);
  w.setAttribute("w:date", date);
  run.parentNode.insertBefore(w, run);
  w.appendChild(run);
}

function ancestorOf(el, localName) {
  for (let n = el.parentNode; n; n = n.parentNode) {
    if (n.localName === localName) return true;
  }
  return false;
}

function maxId(xmlDoc) {
  let max = 0;
  for (const tag of ["ins", "del"]) {
    for (const el of allNamed(xmlDoc, tag)) {
      const v = el.getAttribute("w:id") || el.getAttributeNS(NS, "id") || "0";
      max = Math.max(max, parseInt(v, 10) || 0);
    }
  }
  return max;
}

function uVal(uEl) {
  return uEl.getAttribute("w:val") || uEl.getAttributeNS(NS, "val") || "";
}

export {
  NS, SHORT_TEXT_LIMIT,
  parse, serialize,
  hasTrackedChanges, hasUsptoCues, hasMixedFormats,
  applyTcToUsptoTransform, applyUsptoToTcTransform,
  acceptUsptMarkup,
  parseClaimHeader, canonicalStatus,
  collectText, firstChild, childrenNamed, elemChildren, allNamed, ancestorOf,
  stripRpr, ensureRpr, unwrap, wrapRun, addOnce, promoteDelText, uVal, maxId,
};
