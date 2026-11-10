// Illustration Composer — Figma plugin main thread (sandbox code).
// Full source, no build step required — plain JS running in the Figma plugin sandbox.
//
// Responsibilities of this file:
//  1. Keep a "library" of reusable illustration nodes (registered by the user, or
//     found by an optional auto-scan of the document).
//  2. Scenario 1 — pick matching library items for a free-text title/metaphor using
//     a simple keyword/synonym match (no external AI call — see README for why).
//  3. Scenario 2 — let the user add specific library items manually, then
//     duplicate / delete / reorder / rotate them like normal Figma objects.
//  4. Recolor the assembled composition against a chosen palette.
//  5. Export the composition as an editable SVG (vector, not rasterized).
//
// All document access is async per Figma's "dynamic-page" access mode.

figma.showUI(__html__, { width: 380, height: 680, themeColors: true });

const STORAGE_KEY = "illustration-composer:registry";

// ---------------------------------------------------------------------------
// Small built-in RU synonym map. Extend freely — this is intentionally simple
// (plain keyword expansion) rather than a model call, per the task's own
// allowance that the matching step just needs to feel reasonable, not be a
// full NLP pipeline. Users can also add per-item tags by hand in the UI.
// ---------------------------------------------------------------------------
const SYNONYMS = {
  "идея": ["лампа", "инновация", "креатив", "идея", "мысль", "озарение"],
  "деньги": ["кошелек", "кошелёк", "монета", "финансы", "бюджет", "доход", "оплата", "деньги"],
  "команда": ["пазлы", "пазл", "команда", "сотрудничество", "совместно", "коллаборация"],
  "связь": ["телефон", "наушники", "звонок", "коммуникация", "подкаст", "музыка", "связь"],
  "работа": ["папка", "документ", "задача", "проект", "работа", "офис"],
  "время": ["часы", "время", "дедлайн", "срок"],
  "рост": ["график", "рост", "стратегия", "аналитика"]
};

function deriveTags(name) {
  const lower = (name || "").toLowerCase();
  const words = lower.split(/[^a-zа-яё0-9]+/i).filter(Boolean);
  const tags = new Set(words);
  for (const w of words) {
    for (const key in SYNONYMS) {
      if (key === w || SYNONYMS[key].includes(w)) {
        tags.add(key);
        SYNONYMS[key].forEach((s) => tags.add(s));
      }
    }
  }
  return Array.from(tags);
}

function matchScore(itemTags, queryTokens) {
  let score = 0;
  for (const qt of queryTokens) {
    if (itemTags.includes(qt)) score += 3;
    for (const key in SYNONYMS) {
      const group = SYNONYMS[key];
      if ((key === qt || group.includes(qt)) && (itemTags.includes(key) || group.some((s) => itemTags.includes(s)))) {
        score += 2;
      }
    }
    for (const t of itemTags) {
      if (t.length > 3 && (t.includes(qt) || qt.includes(t))) score += 1;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Registry persistence — we only ever store {id, name, tags}; the actual node
// is re-fetched live via getNodeByIdAsync so edits made elsewhere stay in sync.
// ---------------------------------------------------------------------------
async function loadRegistry() {
  const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function saveRegistry(registry) {
  await figma.clientStorage.setAsync(STORAGE_KEY, registry);
}

async function registryWithLiveThumbs(registry) {
  const out = [];
  for (const entry of registry) {
    const node = await figma.getNodeByIdAsync(entry.id);
    if (!node) continue; // node was deleted from the document — drop silently
    let thumb = null;
    try {
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
      thumb = figma.base64Encode(bytes);
    } catch (e) {
      // some node types can't export (e.g. empty groups) — skip thumbnail only
    }
    out.push({ id: entry.id, name: node.name, tags: entry.tags, thumb });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auto-scan (optional): looks at every page except the briefing/example pages
// and collects the immediate children of each top-level frame/group as
// candidate illustration items. This is a heuristic starting point — the UI
// lets the user untick anything that isn't actually an illustration (palette
// swatches, backgrounds, etc.) before adding it to the registry.
// ---------------------------------------------------------------------------
const SKIP_PAGE_NAMES = /задани|задача|пример|cover|обложк/i;

async function scanDocument() {
  await figma.loadAllPagesAsync();
  const found = [];
  const seen = new Set();
  for (const page of figma.root.children) {
    if (SKIP_PAGE_NAMES.test(page.name)) continue;
    for (const top of page.children) {
      const container = top.type === "FRAME" || top.type === "GROUP" ? top : null;
      const candidates = container ? container.children : [top];
      for (const node of candidates) {
        if (node.type === "TEXT") continue;
        if (!("width" in node)) continue;
        if (node.width < 16 || node.height < 16) continue;
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        found.push({ id: node.id, name: node.name, tags: deriveTags(node.name), pageName: page.name });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Composition assembly
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255
  };
}

function rgbToHex(c) {
  const to255 = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to255(c.r)}${to255(c.g)}${to255(c.b)}`;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function buildComposition({ ids, width, height }) {
  const frame = figma.createFrame();
  frame.name = `Композиция — ${new Date().toLocaleString("ru-RU")}`;
  frame.resize(width, height);
  frame.x = figma.viewport.center.x - width / 2;
  frame.y = figma.viewport.center.y - height / 2;
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  figma.currentPage.appendChild(frame);

  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const rows = Math.max(1, Math.ceil(ids.length / cols));
  const cellW = width / cols;
  const cellH = height / rows;

  let i = 0;
  for (const id of ids) {
    const src = await figma.getNodeByIdAsync(id);
    if (!src || !("clone" in src)) continue;
    const clone = src.clone();
    frame.appendChild(clone);

    const targetW = cellW * 0.6;
    const targetH = cellH * 0.6;
    const scale = Math.min(targetW / clone.width, targetH / clone.height, 1.5);
    if ("resize" in clone && isFinite(scale) && scale > 0) {
      clone.resize(Math.max(1, clone.width * scale), Math.max(1, clone.height * scale));
    }

    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (Math.random() - 0.5) * cellW * 0.25;
    const jitterY = (Math.random() - 0.5) * cellH * 0.25;
    clone.x = col * cellW + (cellW - clone.width) / 2 + jitterX;
    clone.y = row * cellH + (cellH - clone.height) / 2 + jitterY;
    if ("rotation" in clone) clone.rotation = (Math.random() - 0.5) * 16;
    i++;
  }

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  return frame;
}

function collectFillColors(node, set) {
  if ("fills" in node && Array.isArray(node.fills)) {
    for (const p of node.fills) {
      if (p.type === "SOLID") set.add(rgbToHex(p.color));
    }
  }
  if ("children" in node) {
    for (const c of node.children) collectFillColors(c, set);
  }
}

function applyPalette(frame, paletteHex) {
  const colorSet = new Set();
  collectFillColors(frame, colorSet);
  const oldColors = Array.from(colorSet).sort((a, b) => luminance(a) - luminance(b));
  const newColors = paletteHex.slice().sort((a, b) => luminance(a) - luminance(b));
  if (newColors.length === 0) return;

  const map = {};
  oldColors.forEach((c, idx) => {
    const ratio = idx / Math.max(1, oldColors.length - 1);
    const newIdx = Math.round(ratio * (newColors.length - 1));
    map[c] = newColors[newIdx];
  });

  function walk(node) {
    if ("fills" in node && Array.isArray(node.fills)) {
      node.fills = node.fills.map((p) => {
        if (p.type !== "SOLID") return p;
        const hex = rgbToHex(p.color);
        const target = map[hex];
        return target ? Object.assign({}, p, { color: hexToRgb(target) }) : p;
      });
    }
    if ("children" in node) node.children.forEach(walk);
  }
  walk(frame);
}

// ---------------------------------------------------------------------------
// Manual (Scenario 2) controls — act on the current Figma selection.
// ---------------------------------------------------------------------------
function duplicateSelection() {
  const clones = figma.currentPage.selection.map((n) => {
    const c = n.clone();
    c.x = n.x + 16;
    c.y = n.y + 16;
    if (n.parent) n.parent.appendChild(c);
    return c;
  });
  figma.currentPage.selection = clones;
}

function deleteSelection() {
  figma.currentPage.selection.forEach((n) => n.remove());
  figma.currentPage.selection = [];
}

function reorderSelection(dir) {
  figma.currentPage.selection.forEach((n) => {
    if (!n.parent) return;
    const idx = n.parent.children.indexOf(n);
    if (dir === "front") n.parent.appendChild(n);
    else if (dir === "back") n.parent.insertChild(0, n);
  });
}

function rotateSelection(delta) {
  figma.currentPage.selection.forEach((n) => {
    if ("rotation" in n) n.rotation = (n.rotation || 0) + delta;
  });
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "init") {
      const registry = await loadRegistry();
      figma.ui.postMessage({ type: "registry", items: await registryWithLiveThumbs(registry) });
    }

    if (msg.type === "scan") {
      const found = await scanDocument();
      figma.ui.postMessage({ type: "scan-result", items: found });
    }

    if (msg.type === "register") {
      // msg.items: [{id,name,tags}]
      const registry = await loadRegistry();
      const byId = new Map(registry.map((e) => [e.id, e]));
      for (const it of msg.items) byId.set(it.id, { id: it.id, name: it.name, tags: it.tags });
      const next = Array.from(byId.values());
      await saveRegistry(next);
      figma.ui.postMessage({ type: "registry", items: await registryWithLiveThumbs(next) });
    }

    if (msg.type === "register-selection") {
      const sel = figma.currentPage.selection;
      if (sel.length === 0) {
        figma.notify("Avval Figma ’da kerakli obyekt(lar)ni tanlang");
      } else {
        const registry = await loadRegistry();
        const byId = new Map(registry.map((e) => [e.id, e]));
        for (const n of sel) byId.set(n.id, { id: n.id, name: n.name, tags: deriveTags(n.name) });
        const next = Array.from(byId.values());
        await saveRegistry(next);
        figma.ui.postMessage({ type: "registry", items: await registryWithLiveThumbs(next) });
        figma.notify(`Kutubxonaga qo'shildi: ${sel.length} ta element`);
      }
    }

    if (msg.type === "unregister") {
      const registry = await loadRegistry();
      const next = registry.filter((e) => e.id !== msg.id);
      await saveRegistry(next);
      figma.ui.postMessage({ type: "registry", items: await registryWithLiveThumbs(next) });
    }

    if (msg.type === "update-tags") {
      const registry = await loadRegistry();
      const entry = registry.find((e) => e.id === msg.id);
      if (entry) entry.tags = msg.tags;
      await saveRegistry(registry);
      figma.ui.postMessage({ type: "registry", items: await registryWithLiveThumbs(registry) });
    }

    if (msg.type === "match") {
      const registry = await loadRegistry();
      const queryTokens = (msg.query || "").toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(Boolean);
      const scored = registry
        .map((e) => ({ entry: e, score: matchScore(e.tags, queryTokens) }))
        .sort((a, b) => b.score - a.score);
      let chosen = scored.filter((s) => s.score > 0).slice(0, msg.count || 5);
      let usedFallback = false;
      if (chosen.length === 0 && registry.length > 0) {
        usedFallback = true;
        const shuffled = registry.slice().sort(() => Math.random() - 0.5);
        chosen = shuffled.slice(0, msg.count || 5).map((e) => ({ entry: e, score: 0 }));
      }
      figma.ui.postMessage({
        type: "match-result",
        ids: chosen.map((c) => c.entry.id),
        names: chosen.map((c) => c.entry.name),
        usedFallback
      });
    }

    if (msg.type === "build") {
      const frame = await buildComposition({ ids: msg.ids, width: msg.width, height: msg.height });
      figma.ui.postMessage({ type: "build-result", frameId: frame.id, name: frame.name });
    }

    if (msg.type === "add-to-selected-frame") {
      // Adds one library item into the currently selected frame (or creates one if none selected)
      let frame = figma.currentPage.selection.find((n) => n.type === "FRAME");
      if (!frame) {
        frame = await buildComposition({ ids: [], width: 1200, height: 630 });
      }
      const src = await figma.getNodeByIdAsync(msg.id);
      if (src && "clone" in src) {
        const clone = src.clone();
        frame.appendChild(clone);
        clone.x = frame.width / 2 - clone.width / 2 + (Math.random() - 0.5) * 100;
        clone.y = frame.height / 2 - clone.height / 2 + (Math.random() - 0.5) * 100;
        figma.currentPage.selection = [clone];
        figma.viewport.scrollAndZoomIntoView([clone]);
      }
    }

    if (msg.type === "duplicate") duplicateSelection();
    if (msg.type === "delete") deleteSelection();
    if (msg.type === "front") reorderSelection("front");
    if (msg.type === "back") reorderSelection("back");
    if (msg.type === "rotate") rotateSelection(msg.delta || 15);

    if (msg.type === "recolor") {
      const frame = await figma.getNodeByIdAsync(msg.frameId);
      if (frame) applyPalette(frame, msg.palette);
    }

    if (msg.type === "export") {
      const frame = await figma.getNodeByIdAsync(msg.frameId);
      if (frame && "exportAsync" in frame) {
        const bytes = await frame.exportAsync({ format: "SVG" });
        figma.ui.postMessage({ type: "export-result", bytes: Array.from(bytes), name: frame.name });
      }
    }
  } catch (err) {
    figma.notify("Xatolik: " + (err && err.message ? err.message : String(err)));
    figma.ui.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
