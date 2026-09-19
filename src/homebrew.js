// ================================================================ homebrew library
// A library of spells, feats, features, and magic items shared by every character: fill in a
// Player's Handbook spell once and every character who has it gets the text. Entries also
// link out to the wiki, and a page copied from the wiki can be pasted in to fill the fields.

export const WIKI = {
  "2024": { base: "https://dnd2024.wikidot.com", label: "dnd2024.wikidot.com", species: "species" },
  "2014": { base: "https://dnd5e.wikidot.com", label: "dnd5e.wikidot.com", species: "lineage" },
};
export const KINDS = [
  ["spell", "Spell"],
  ["feat", "Feat"],
  ["feature", "Class or species feature"],
  ["item", "Magic item"],
];

// Wikidot page names: lowercase, and every run of other characters becomes one hyphen.
// "Hunter's Mark" → hunter-s-mark, "Lords' Alliance Agent" → lords-alliance-agent.
export function slug(name) {
  return String(name || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Names compare loosely: case, curly quotes, and stray spaces don't matter.
export function sameName(a, b) {
  const n = (s) => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

export function wikiSite(system) { return WIKI[system === "2014" ? "2014" : "2024"]; }

// Point a ruleset's links at a different wikidot site ("dnd5e.wikidot.com" or a full URL).
export function setWikiBase(system, host) {
  const key = system === "2014" ? "2014" : "2024";
  const h = String(host || "").trim().replace(/\/+$/, "");
  if (!h) return;
  WIKI[key] = { ...WIKI[key], base: /^https?:\/\//.test(h) ? h : "https://" + h, label: h.replace(/^https?:\/\//, "") };
}

export function wikiSearch(name, system) {
  return `${wikiSite(system).base}/search:site/q/${encodeURIComponent(String(name || "").trim())}`;
}

// The page for an entry, or null when the kind has no page of its own (then use the search).
// A few wiki pages don't follow the naming rule, so the search sits next to every link.
export function wikiUrl(kind, name, system, extra = {}) {
  const site = wikiSite(system);
  const s = slug(name);
  if (!s) return null;
  const cls = slug(extra.cls || "");
  switch (kind) {
    case "spell": return `${site.base}/spell:${s}`;
    case "feat": return `${site.base}/feat:${s}`;
    case "item": return `${site.base}/magic-item:${s}`;
    case "background": return `${site.base}/background:${s}`;
    case "species": return `${site.base}/${site.species}:${s}`;
    case "subclass": return cls ? `${site.base}/${cls}:${s}` : null;
    case "class": return `${site.base}/${s}:main`;
    case "feature": return cls ? `${site.base}/${cls}:main` : null;
    default: return null;
  }
}

// ---------------------------------------------------------------- paste parsing
const SCHOOLS = ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"];
const CLASS_NAMES = ["artificer", "bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"];
const FOOTER = /^(Help \||Powered by|Unless otherwise stated|Click here|Check out how|If you want to discuss|View and manage|A few useful tools|See pages that|Change the name|View wiki source|View\/set parent|Notify administrators|Something does not work|General Wikidot|Wikidot\.com)/i;
const CHROME = /^(Home\s*»|Create a Page|Site Navigation|Menu|Toggle navigation|Share on|Explore »|\[?Help Docs|You should be logged in)/i;

function cleanLines(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\u00a0/g, " ").replace(/\*\*/g, "").replace(/^\*(.+)\*$/, "$1").trim());
  const out = [];
  for (const l of lines) {
    if (FOOTER.test(l)) break;
    out.push(l);
  }
  return out;
}

// The page title: a breadcrumb's last segment ("Home » All Spells » Hunter's Mark"), or the
// first line before "Source:" that isn't site chrome.
function findName(lines) {
  const crumb = lines.find((l) => /»/.test(l));
  if (crumb) { const last = crumb.split("»").pop().trim(); if (last) return last; }
  const src = lines.findIndex((l) => /^Source:/i.test(l));
  const before = (src >= 0 ? lines.slice(0, src) : lines.slice(0, 1)).filter((l) => l && !CHROME.test(l) && !/D&D 5e/.test(l));
  return before.length ? before[before.length - 1] : "";
}

// Body text: everything after the header lines, with the wiki's tag line dropped.
function bodyAfter(lines, startIdx) {
  const rest = lines.slice(startIdx);
  while (rest.length && !rest[rest.length - 1]) rest.pop();
  // The tag line at the bottom is short lowercase words run together ("divination first ranger").
  if (rest.length && /^[a-z0-9-]+(\s+[a-z0-9-]+)*$/.test(rest[rest.length - 1]) && rest[rest.length - 1].length < 80) rest.pop();
  return rest.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseWikiPaste(text, kind) {
  const lines = cleanLines(text);
  const out = {};
  const name = findName(lines);
  if (name) out.name = name;
  const srcLine = lines.find((l) => /^Source:/i.test(l));
  if (srcLine) out.source = srcLine.replace(/^Source:\s*/i, "").trim();
  let last = lines.findIndex((l) => /^Source:/i.test(l));

  if (kind === "spell") {
    lines.forEach((l, i) => {
      let m;
      // 2024: "Level 1 Divination (Ranger)" or "Evocation Cantrip (Sorcerer, Wizard)"
      if ((m = /^Level\s+(\d)\s+(\w+)(?:\s*\(([^)]*)\))?/i.exec(l))) { out.level = +m[1]; out.school = m[2].toLowerCase(); if (m[3]) out.classes = m[3]; last = Math.max(last, i); }
      else if ((m = /^(\w+)\s+Cantrip(?:\s*\(([^)]*)\))?/i.exec(l)) && SCHOOLS.includes(m[1].toLowerCase())) { out.level = 0; out.school = m[1].toLowerCase(); if (m[2]) out.classes = m[2]; last = Math.max(last, i); }
      // 2014: "1st-level evocation" or "Evocation cantrip", sometimes "(ritual)"
      else if ((m = /^(\d)(?:st|nd|rd|th)-level\s+(\w+)(\s*\(ritual\))?/i.exec(l))) { out.level = +m[1]; out.school = m[2].toLowerCase(); if (m[3]) out.ritual = true; last = Math.max(last, i); }
      else if ((m = /^Casting Time:\s*(.+)/i.exec(l))) { out.time = m[1].trim(); if (/ritual|\bor R\b/i.test(m[1])) out.ritual = true; last = Math.max(last, i); }
      else if ((m = /^Range:\s*(.+)/i.exec(l))) { out.range = m[1].trim(); last = Math.max(last, i); }
      else if ((m = /^Components:\s*(.+)/i.exec(l))) {
        const comp = m[1].trim(); const mat = /\(([^)]+)\)/.exec(comp);
        out.comp = comp.replace(/\s*\([^)]*\)/, "").trim(); if (mat) out.mat = mat[1]; last = Math.max(last, i);
      }
      else if ((m = /^Duration:\s*(.+)/i.exec(l))) { out.dur = m[1].trim(); if (/concentration/i.test(m[1])) out.conc = true; last = Math.max(last, i); }
      else if ((m = /^Spell Lists?\.?\s*(.+)/i.exec(l))) { out.classes = m[1]; }
    });
    if (out.classes) out.classes = String(out.classes).toLowerCase().split(/[,/]+/).map((x) => x.trim()).filter((x) => CLASS_NAMES.includes(x));
    let body = bodyAfter(lines, last + 1).split("\n").filter((l) => !/^Spell Lists?\./i.test(l)).join("\n").trim();
    const hi = /(?:^|\n)(Using a Higher-Level Spell Slot\.|At Higher Levels\.|Cantrip Upgrade\.)\s*([\s\S]*)$/i.exec(body);
    if (hi && !/^Cantrip Upgrade/i.test(hi[1])) { out.higher = hi[2].trim(); body = body.slice(0, hi.index).trim(); }
    if (body) out.desc = body;
    if (out.ritual == null && /\britual\b/i.test(lines.find((l) => /^Level|cantrip|-level/i.test(l)) || "")) out.ritual = true;
    return out;
  }

  if (kind === "feat") {
    const catIdx = lines.findIndex((l, i) => i > last && /\b(Origin|General|Fighting Style|Epic Boon|Dragonmark|Planar Pact|Dark Gift)\s+Feat\b/i.test(l) && l.length < 120);
    if (catIdx >= 0) {
      const l = lines[catIdx];
      out.cat = /origin/i.test(l) ? "origin" : /fighting style/i.test(l) ? "fighting-style" : /epic/i.test(l) ? "epic" : /general/i.test(l) ? "general" : "other";
      const pre = /Prerequisite:?\s*([^)]+)\)?/i.exec(l); if (pre) out.prereq = pre[1].trim();
      last = catIdx;
    } else {
      const pre = lines.findIndex((l, i) => i > last && /^Prerequisite:/i.test(l));
      if (pre >= 0) { out.prereq = lines[pre].replace(/^Prerequisite:\s*/i, ""); last = pre; }
    }
    const body = bodyAfter(lines, last + 1);
    if (body) out.desc = body;
    return out;
  }

  if (kind === "item") {
    const tIdx = lines.findIndex((l, i) => i > last && /\b(common|uncommon|rare|very rare|legendary|artifact|varies)\b/i.test(l) && l.length < 140);
    if (tIdx >= 0) {
      const l = lines[tIdx];
      const r = /\b(very rare|uncommon|common|rare|legendary|artifact|varies)\b/i.exec(l);
      out.rarity = r[1].toLowerCase();
      out.type = l.split(",")[0].replace(/\(.*$/, "").trim();
      if (/requires attunement/i.test(l)) out.attune = true;
      last = tIdx;
    }
    const body = bodyAfter(lines, last + 1);
    if (body) out.desc = body;
    return out;
  }

  // feature: just the text
  const body = bodyAfter(lines, last + 1);
  if (body) out.desc = body;
  return out;
}

// ---------------------------------------------------------------- merging into the rules
// The library for one ruleset, folded into the bundled data so every picker, lookup, and
// search sees it. Bundled entries win on a name clash: the library fills gaps.
const cache = new WeakMap();
export function withLibrary(D, lib) {
  if (!D) return D;
  const entries = (lib || []).filter((e) => !e.system || e.system === "both" || e.system === D.SYSTEM || (e.system === "2014" && D.SYSTEM !== "2024"));
  if (!entries.length) return D;
  let byLib = cache.get(D);
  if (!byLib) { byLib = new Map(); cache.set(D, byLib); }
  const key = entries.map((e) => e.id + ":" + e.rev).join("|");
  if (byLib.has(key)) return byLib.get(key);
  const has = (list, name) => (list || []).some((x) => sameName(x.name, name));
  const of = (kind) => entries.filter((e) => e.kind === kind);
  const spells = of("spell").filter((e) => !has(D.SPELLS, e.name)).map((e) => ({
    name: e.name, level: +e.level || 0, school: e.school || "", time: e.time || "", range: e.range || "", comp: e.comp || "",
    mat: e.mat || "", dur: e.dur || "", conc: !!e.conc, ritual: !!e.ritual, classes: e.classes || [], desc: e.desc || "",
    higher: e.higher || "", source: e.source || "Homebrew", homebrew: true, libId: e.id,
  }));
  const feats = of("feat").filter((e) => !has(D.FEATS, e.name)).map((e) => ({
    key: "hb-" + slug(e.name), name: e.name, type: e.cat || "general", prereq: e.prereq || "", desc: e.desc || "",
    source: e.source || "Homebrew", homebrew: true, libId: e.id,
  }));
  const items = of("item").filter((e) => !has(D.MAGIC_ITEMS, e.name)).map((e) => ({
    name: e.name, type: e.type || "Wondrous item", rarity: e.rarity || "", attune: !!e.attune, desc: e.desc || "",
    source: e.source || "Homebrew", homebrew: true, libId: e.id,
  }));
  const features = of("feature").map((e) => ({ name: e.name, desc: e.desc || "", source: e.source || "", libId: e.id }));
  const merged = {
    ...D,
    SPELLS: [...D.SPELLS, ...spells],
    FEATS: [...(D.FEATS || []), ...feats],
    MAGIC_ITEMS: [...(D.MAGIC_ITEMS || []), ...items],
    LIB_FEATURES: features,
  };
  byLib.set(key, merged);
  return merged;
}

// Library text for a name, for character entries that came in without any.
export function libraryText(D, kind, name) {
  const list = kind === "feat" ? D.FEATS : kind === "item" ? D.MAGIC_ITEMS : kind === "spell" ? D.SPELLS : D.LIB_FEATURES;
  return (list || []).find((x) => sameName(x.name, name))?.desc || "";
}

// ---------------------------------------------------------------- what's missing
// Everything on this character that has a name but no rules text: the list the Notes tab
// shows, each with a wiki link and a way to fill it in.
export function missingEntries(c, dv, D) {
  const out = [];
  const dismissed = new Set((c.hbDismissed || []).map((x) => x.toLowerCase()));
  const push = (e) => { if (!dismissed.has((e.kind + ":" + e.name).toLowerCase())) out.push(e); };
  (dv?.spell?.spells || []).forEach((s) => {
    if (!s.data?.desc) push({ kind: "spell", name: s.name, level: s.level, cls: s.cls, source: s.data?.source, page: s.data?.page });
  });
  (c.customFeats || []).forEach((f) => { if (!f.desc && !libraryText(D, "feat", f.name)) push({ kind: "feat", name: f.name }); });
  (c.customFeatures || []).forEach((f) => { if (!f.desc && !libraryText(D, "feature", f.name)) push({ kind: "feature", name: f.name, source: f.source, cls: (c.classes || [])[0]?.cls }); });
  (c.items || []).forEach((it) => {
    if (it.desc) return;
    const known = (D.GEAR || []).some((g) => sameName(g.name, it.name) || String(g.name).toLowerCase().startsWith(String(it.name).toLowerCase()))
      || (D.MAGIC_ITEMS || []).some((m) => sameName(m.name, it.name));
    if (!known && (it.attuned || it.attune || it.magicItem)) push({ kind: "item", name: it.name });
  });
  if (c.race === "__custom" && c.customRace?.name) push({ kind: "species", name: c.customRace.name, linkOnly: true });
  if (c.background === "__custom" && c.customBackground?.name) push({ kind: "background", name: c.customBackground.name, linkOnly: true });
  (c.classes || []).forEach((cl) => {
    if (cl.subclass === "__custom" && cl.subclassName && !cl.subclassDesc) push({ kind: "subclass", name: cl.subclassName, cls: cl.cls, linkOnly: true });
  });
  return out;
}
