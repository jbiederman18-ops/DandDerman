import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
// The rules data lives in its own file per ruleset and is fetched the first time a character
// needs it, so a 2024-only table never downloads the 2014 books.
let D = null;
const DATA_CACHE = {};
export const SYSTEMS = { "2024": "2024 rules", "2014": "2014 rules" };
// A failed module load is remembered by the browser for the life of the page, so a retry
// has to ask for a fresh URL. Three tries with a short wait between, then the error goes up
// to the loading screen, which offers Try again instead of hanging.
const DATA_FILE = { "2014": "./dnd5e-data.js", "2024": "./dnd5e-data-2024.js" };
async function loadData(system) {
  const key = system === "2014" ? "2014" : "2024";
  if (!DATA_CACHE[key]) {
    let last;
    for (let attempt = 0; attempt < 3 && !DATA_CACHE[key]; attempt++) {
      try {
        if (attempt === 0) {
          // Static paths here, so the single-file preview build can inline the data.
          DATA_CACHE[key] = key === "2014" ? await import("./dnd5e-data.js") : await import("./dnd5e-data-2024.js");
        } else {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          const url = DATA_FILE[key] + "?retry=" + Date.now();
          DATA_CACHE[key] = await import(/* retry */ url);
        }
      } catch (e) { last = e; }
    }
    if (!DATA_CACHE[key]) throw last || new Error("The rules didn't load");
  }
  D = DATA_CACHE[key];
  return D;
}
import * as E from "./dnd5e-engine.js";
import { importPdf } from "./ddb-import.js";
import { THEMES, themeCss } from "./theme.js";
import { Gear } from "./gear.jsx";
import { Spells } from "./spells.jsx";
import * as H from "./homebrew.js";
import { MissingCard, LibraryCard, WikiLinks } from "./library.jsx";
import { Play, DiceOverlay, DiceTray, ConditionsModal, EffectsModal, RestModal, rollPool } from "./play.jsx";

const { ABIL, ABILNAME, sgn } = E;

// ================================================================ storage
// One document per character plus a small index, which is what the sync layer in
// index.html expects: it merges index documents by unioning their id lists, and
// resolves per-document conflicts with the `rev` counter. Editing two different
// characters on two devices therefore costs neither of them.
const IDX = "dnd5e:index";
const charKey = (id) => "dnd5e:char:" + id;
const HB = "dnd5e:hb:";
const LEGACY = "dnd5e_sheet_v1";

const raw = {
  async get(key) {
    try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
  },
  async set(key, value) {
    try { return !!(await window.storage.set(key, JSON.stringify(value))); } catch { return false; }
  },
  async del(key) { try { await window.storage.delete(key); } catch { /* already gone */ } },
};

const store = {
  async load() {
    const idx = await raw.get(IDX);
    if (!idx) return store.migrate();
    const docs = await Promise.all((idx.ids || []).map((id) => raw.get(charKey(id))));
    const chars = [], revs = {};
    docs.forEach((doc) => { if (doc?.char) { chars.push(doc.char); revs[doc.char.id] = doc.rev || 1; } });
    return { chars, revs, meta: idx };
  },
  // Older builds kept everything in a single document.
  async migrate() {
    const old = await raw.get(LEGACY);
    if (!old?.chars?.length) return null;
    const revs = {};
    for (const ch of old.chars) { await raw.set(charKey(ch.id), { char: ch, rev: 1, at: Date.now() }); revs[ch.id] = 1; }
    await raw.set(IDX, { ids: old.chars.map((c) => c.id), activeId: old.activeId, theme: old.theme, animate: old.animate, rev: 1 });
    return { chars: old.chars, revs, meta: old };
  },
  async saveChar(char, rev) {
    const next = (rev || 0) + 1;
    return (await raw.set(charKey(char.id), { char, rev: next, at: Date.now() })) ? next : 0;
  },
  async saveIndex(meta, rev) { await raw.set(IDX, { ...meta, rev: (rev || 0) + 1 }); },
  async removeChar(id) { await raw.del(charKey(id)); },
  // The homebrew library: one document per entry, so two devices adding entries at once
  // never overwrite each other.
  async loadLibrary() {
    try {
      const r = await window.storage.list(HB);
      const docs = await Promise.all((r?.keys || []).map((k) => raw.get(k)));
      return docs.filter((d) => d && d.id && d.name);
    } catch { return []; }
  },
  async saveEntry(e) { return raw.set(HB + e.id, e); },
  async removeEntry(id) { await raw.del(HB + id); },
};

// ================================================================ helpers
const SRC_SHORT = { srd24: "SRD 5.2", srd: "SRD", o5: "Open5e", toh: "Tome of Heroes", tdcs: "Tal'Dorei", deepm: "Deep Magic", deepmx: "Deep Magic Ext.", kp: "Kobold Press", wz: "Warlock Zine", vom: "Vault of Magic" };
const SRC_ORDER = ["srd24", "srd", "o5", "toh", "tdcs", "deepm", "deepmx", "kp", "wz", "vom"];
const SKILL_LIST = [["acrobatics","Acrobatics","dex"],["animal-handling","Animal Handling","wis"],["arcana","Arcana","int"],
  ["athletics","Athletics","str"],["deception","Deception","cha"],["history","History","int"],["insight","Insight","wis"],
  ["intimidation","Intimidation","cha"],["investigation","Investigation","int"],["medicine","Medicine","wis"],
  ["nature","Nature","int"],["perception","Perception","wis"],["performance","Performance","cha"],
  ["persuasion","Persuasion","cha"],["religion","Religion","int"],["sleight-of-hand","Sleight of Hand","dex"],
  ["stealth","Stealth","dex"],["survival","Survival","wis"]];
const SKILLNAME = Object.fromEntries(SKILL_LIST.map(([k, n]) => [k, n]));
const SKILLAB = Object.fromEntries(SKILL_LIST.map(([k, , a]) => [k, a]));
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
const d = (n) => 1 + Math.floor(Math.random() * n);
const roll4d6 = () => { const r = [d(6), d(6), d(6), d(6)].sort((a, b) => a - b); return r[1] + r[2] + r[3]; };
const bySource = (list) => SRC_ORDER.map((s) => [s, list.filter((x) => x.source === s)]).filter(([, l]) => l.length);

function Opts({ list, valueKey = "key", labelKey = "name" }) {
  return bySource(list).map(([s, l]) => (
    <optgroup key={s} label={SRC_SHORT[s]}>
      {l.map((x) => <option key={x[valueKey]} value={x[valueKey]}>{x[labelKey]}</option>)}
    </optgroup>
  ));
}

// Markdown-lite for rules text: paragraphs, bullet lists, pipe tables, **bold**, *italic*, _italic_
function inline(text) {
  const out = []; let rest = String(text); let i = 0;
  const re = /(\*\*\*([^*]+)\*\*\*|\*\*_?([^*]+?)_?\*\*|\*([^*\n]+)\*|_([^_\n]+)_)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    if (m[2]) out.push(<strong key={i++}><em>{m[2]}</em></strong>);
    else if (m[3]) out.push(<strong key={i++}>{m[3]}</strong>);
    else out.push(<em key={i++}>{m[4] || m[5]}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
function Md({ text }) {
  if (!text) return null;
  const blocks = String(text).split(/\n\s*\n/);
  return (
    <div className="md">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => l.trim().startsWith("|"))) {
          const rows = lines.filter((l) => !/^\|[\s-|:]+\|$/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim()));
          return <div className="tbl" key={bi}><table><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => ri === 0 ? <th key={ci}>{inline(cell)}</th> : <td key={ci}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
        }
        if (lines.every((l) => /^\s*[-*•] /.test(l))) return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•] /, ""))}</li>)}</ul>;
        return <p key={bi}>{lines.map((l, li) => <React.Fragment key={li}>{li ? <br /> : null}{inline(l)}</React.Fragment>)}</p>;
      })}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div className="xs mut" style={{ marginBottom: 3, fontWeight: 600 }}>{label}</div>
      {children}
      {hint ? <div className="xs mut" style={{ marginTop: 3 }}>{hint}</div> : null}
    </label>
  );
}

function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheetin" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        {children}
        {footer ? <div style={{ position: "sticky", bottom: -14, background: "var(--pan)", padding: "10px 0 2px", marginTop: 8, borderTop: "1px solid var(--line)" }}>{footer}</div> : null}
      </div>
    </div>
  );
}

// multi-select chips. options: [{value,label,disabled,title}]
function Chips({ options, value = [], max = 99, onChange }) {
  const set = new Set(value);
  const full = set.size >= max;
  return (
    <div className="chips">
      {options.map((o) => {
        const on = set.has(o.value);
        return (
          <button key={o.value} type="button" className={"pill" + (on ? " on" : "")} aria-pressed={on} title={o.title}
            disabled={o.disabled || (!on && full && max > 1)}
            onClick={() => {
              if (on) onChange(value.filter((v) => v !== o.value));
              else if (max === 1) onChange([o.value]);
              else if (!full) onChange([...value, o.value]);
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
const skillOpts = (keys) => keys.map((k) => ({ value: k, label: SKILLNAME[k] || k }));
function Count({ have, need }) {
  return <span className={"badge" + (have >= need ? "" : " gold")}>{have}/{need}</span>;
}

function Feature({ name, desc, right, open }) {
  return (
    <details className="ft" open={open}>
      <summary><span className="ttl">{name}</span><span className="row" style={{ gap: 6, marginLeft: "auto" }}>{right}</span></summary>
      <Md text={desc} />
    </details>
  );
}

// ================================================================ import from D&D Beyond
function ImportPdf({ onAdd }) {
  const [state, setState] = useState({ status: "idle" });
  const [system, setSystem] = useState("2024");
  const input = useRef(null);

  const handle = async (file) => {
    if (!file) return;
    setState({ status: "working" });
    try {
      const [PDFLib, data] = await Promise.all([import("./pdf-lib.js"), loadData(system)]);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await importPdf(bytes, PDFLib, data, system);
      setState({ status: "ready", ...result });
    } catch (err) {
      setState({ status: "error", message: err.message || "That file couldn't be read." });
    }
  };

  if (state.status === "ready") {
    const { character, report, check } = state;
    const dv = E.derive(character, D);
    return (
      <div>
        <div className="between" style={{ marginBottom: 8 }}>
          <div><strong style={{ fontSize: 16 }}>{character.name}</strong>
            <div className="sm mut">Level {dv.level} {dv.subrace?.name || dv.race.name} · {dv.classLine}</div></div>
        </div>
        <div className="sm" style={{ fontWeight: 700, margin: "10px 0 4px" }}>Checked against the sheet</div>
        {check.map((r) => (
          <div className="skrow" key={r.label}>
            <span className="row" style={{ gap: 7 }}><span className={"dot" + (r.ok ? " p2" : "")} />{r.label}</span>
            <span className="sm">{r.ok ? r.ours : <span style={{ color: "var(--wrntx)" }}>app {r.ours} · sheet {r.theirs}</span>}</span>
          </div>
        ))}
        {report.custom.length > 0 && (
          <>
            <div className="sm" style={{ fontWeight: 700, margin: "12px 0 4px" }}>Kept as your own entries</div>
            {report.custom.map((x, i) => <div className="sm mut" key={i} style={{ marginBottom: 4 }}>{x}</div>)}
          </>
        )}
        {report.adjusted.length > 0 && (
          <>
            <div className="sm" style={{ fontWeight: 700, margin: "12px 0 4px" }}>Set by hand to match the sheet</div>
            {report.adjusted.map((x, i) => <div className="sm mut" key={i} style={{ marginBottom: 4 }}>{x}</div>)}
          </>
        )}
        {report.review.map((x, i) => <div className="warn" key={i}>{x}</div>)}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn pri" onClick={() => onAdd(character)}>Add {character.name}</button>
          <button className="btn" onClick={() => setState({ status: "idle" })}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sm mut" style={{ marginBottom: 8 }}>
        On D&amp;D Beyond, open the character, choose Export, and pick the PDF. Everything the sheet prints comes
        across — abilities, spells, gear, features. Anything from a book that isn't bundled here is kept as your own
        entry, with the page reference from the sheet.
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {Object.entries(SYSTEMS).map(([k, label]) => (
          <button key={k} className={"pill" + (system === k ? " on" : "")} onClick={() => setSystem(k)}>{label}</button>
        ))}
      </div>
      <input ref={input} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
        onChange={(e) => handle(e.target.files?.[0])} />
      <button className="btn pri" disabled={state.status === "working"} onClick={() => input.current?.click()}>
        {state.status === "working" ? "Reading the sheet…" : "Choose a PDF"}
      </button>
      {state.status === "error" && <div className="warn" style={{ marginTop: 8 }}>{state.message}</div>}
    </div>
  );
}

// ================================================================ loading
function LoadingScreen({ text, system, slow, error, onRetry }) {
  if (error) return (
    <div className="wrap" style={{ paddingTop: 48, maxWidth: 480 }}>
      <div className="card">
        <h3>The rules didn't download</h3>
        <div className="sm mut" style={{ marginBottom: 10 }}>
          Your characters are safe on this device. The {SYSTEMS[system] || "rules"} file couldn't be fetched, which usually
          means the connection dropped partway. Try again once you have signal.
        </div>
        <button className="btn pri" onClick={onRetry}>Try again</button>
        <div className="xs mut" style={{ marginTop: 8 }}>{String(error?.message || error)}</div>
      </div>
    </div>
  );
  return (
    <div className="empty">
      {text}
      {slow && (
        <div className="xs mut" style={{ marginTop: 8 }}>
          Still downloading the {SYSTEMS[system] || "rules"}{system === "2014" ? " (the larger of the two files)" : ""}.
          It's cached after the first time, so the next visit is quicker.
        </div>
      )}
    </div>
  );
}

// ================================================================ app
export default function App() {
  const [chars, setChars] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("build");
  const [loaded, setLoaded] = useState(false);
  const [dataFor, setDataFor] = useState(null);      // which ruleset is in memory right now
  const [newSystem, setNewSystem] = useState("2024");
  const [saveState, setSaveState] = useState("ok");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState("slate");
  const [animate, setAnimate] = useState(true);
  const [log, setLog] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [dice, setDice] = useState(null);
  const [loadErr, setLoadErr] = useState(null);     // the rules file wouldn't come down
  const [bootTry, setBootTry] = useState(0);        // bumped by Try again
  const [slow, setSlow] = useState(false);          // still loading after a few seconds
  const [lib, setLib] = useState([]);               // the homebrew library, shared by every character
  const logRef = useRef(null);
  const timer = useRef(null);
  const revs = useRef({});          // last rev we wrote per character
  const saved = useRef({});         // last object we wrote, to spot real changes
  const idxRev = useRef(0);
  const ids = useRef([]);
  const lastIndex = useRef({});

  useEffect(() => {
    if (loaded) return;
    let live = true;
    (async () => {
      const dd = await store.load();
      const library = await store.loadLibrary();
      const wiki = await raw.get("dnd5e:wiki");
      if (wiki) Object.entries(wiki).forEach(([k, v]) => H.setWikiBase(k, v));
      if (!live) return;
      setLib(library);
      if (dd) { revs.current = dd.revs || {}; idxRev.current = dd.meta?.rev || 0; ids.current = dd.chars.map((x) => x.id); }
      (dd?.chars || []).forEach((x) => { saved.current[x.id] = x; });
      if (dd?.theme && THEMES[dd.theme]) setTheme(dd.theme);
      if (dd?.animate === false) setAnimate(false);
      // Load the rules for the character that was open, not whichever is first in the list,
      // or a mixed table downloads one ruleset and then the other.
      const open = dd?.chars?.find((x) => x.id === dd.activeId) || dd?.chars?.[0];
      const system = open?.system || "2024";
      try { await loadData(system); } catch (e) { if (live) setLoadErr(e); return; }
      if (!live) return;
      setDataFor(system);
      if (dd?.chars?.length) { setChars(dd.chars); setActiveId(open.id); setTab("play"); }
      setLoaded(true);
    })();
    return () => { live = false; };
  }, [bootTry]);

  useEffect(() => {
    if (!loaded) return;
    const dirty = chars.filter((x) => saved.current[x.id] !== x);
    const idsNow = chars.map((x) => x.id);
    const indexChanged = idsNow.join() !== ids.current.join() || activeId !== lastIndex.current.activeId
      || theme !== lastIndex.current.theme || animate !== lastIndex.current.animate;
    if (!dirty.length && !indexChanged) return;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      let ok = true;
      for (const ch of dirty) {
        const rev = await store.saveChar(ch, revs.current[ch.id]);
        if (rev) { revs.current[ch.id] = rev; saved.current[ch.id] = ch; } else ok = false;
      }
      for (const gone of ids.current.filter((id) => !idsNow.includes(id))) {
        await store.removeChar(gone);
        delete revs.current[gone]; delete saved.current[gone];
      }
      if (indexChanged || dirty.length) {
        await store.saveIndex({ ids: idsNow, activeId, theme, animate }, idxRev.current);
        idxRev.current += 1;
      }
      ids.current = idsNow;
      lastIndex.current = { activeId, theme, animate };
      setSaveState(ok ? "ok" : "err");
    }, 600);
    return () => clearTimeout(timer.current);
  }, [chars, activeId, theme, animate, loaded]);

  // The sync layer fires a focus event when another device sends changes; the app
  // re-reads and takes any document whose rev has moved past the one we wrote.
  useEffect(() => {
    if (!loaded) return;
    const refresh = async () => {
      store.loadLibrary().then((l) => setLib((mine) => {
        // take a remote entry only when its rev has moved past ours
        const byId = new Map(mine.map((e) => [e.id, e]));
        l.forEach((e) => { const m = byId.get(e.id); if (!m || (e.rev || 0) > (m.rev || 0)) byId.set(e.id, e); });
        const ids = new Set(l.map((e) => e.id));
        return [...byId.values()].filter((e) => ids.has(e.id) || e._local);
      }));
      const dd = await store.load();
      if (!dd) return;
      idxRev.current = Math.max(idxRev.current, dd.meta?.rev || 0);
      setChars((mine) => {
        const merged = mine.slice();
        dd.chars.forEach((remote) => {
          const rev = dd.revs[remote.id] || 0;
          const i = merged.findIndex((x) => x.id === remote.id);
          if (rev <= (revs.current[remote.id] || 0)) return;        // ours is newer or the same
          revs.current[remote.id] = rev; saved.current[remote.id] = remote;
          if (i < 0) merged.push(remote); else merged[i] = remote;
        });
        ids.current = merged.map((x) => x.id);
        return merged;
      });
    };
    const onVis = () => { if (document.visibilityState !== "hidden") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVis); };
  }, [loaded]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    const root = document.documentElement, el = logRef.current;
    const clear = () => root.style.setProperty("--logh", "0px");
    if (!logOpen || !el) { clear(); return; }
    const measure = () => root.style.setProperty("--logh", el.offsetHeight + "px");
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); clear(); };
  }, [logOpen, log.length]);

  // Every roll lands in the log; the overlay is the animation on top of it.
  const roll = useCallback((r) => {
    if (!r) return;
    setLog((l) => [{ ...r, t: Date.now() }, ...l].slice(0, 60));
    if (animate) setDice(r); else setLogOpen(true);
  }, [animate]);

  const c = chars.find((x) => x.id === activeId) || null;
  const need = c?.system || newSystem;
  useEffect(() => {
    if (!loaded || need === dataFor) return;
    let live = true;
    loadData(need).then(() => live && setDataFor(need), (e) => live && setLoadErr(e));
    return () => { live = false; };
  }, [need, dataFor, loaded, bootTry]);
  const waiting = !loaded || !dataFor || need !== dataFor;
  useEffect(() => {
    if (!waiting || loadErr) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [waiting, loadErr, bootTry]);
  const setChar = useCallback((fn) => {
    setChars((cs) => cs.map((x) => (x.id === activeId ? { ...x, ...fn(x) } : x)));
  }, [activeId]);
  const ready = dataFor === need;
  // The rules in play are the bundled data plus the homebrew library for that ruleset. Every
  // component reads D, so it's swapped for the merged copy before anything below renders.
  const DL = useMemo(() => (dataFor && DATA_CACHE[dataFor] ? H.withLibrary(DATA_CACHE[dataFor], lib) : null), [dataFor, lib]);
  if (DL) D = DL;
  const dv = useMemo(() => (c && ready ? E.derive(c, D) : null), [c, ready, dataFor, DL]);
  const libRef = useRef(lib); libRef.current = lib;
  const libApi = useMemo(() => ({
    save(entry) {
      const had = entry.id ? libRef.current.find((x) => x.id === entry.id) : null;
      const e = { ...(had || {}), ...entry, id: entry.id || "hb" + E.uid(), rev: Math.max(had?.rev || 0, entry.rev || 0) + 1, at: Date.now() };
      delete e._local;
      setLib((l) => [...l.filter((x) => x.id !== e.id), { ...e, _local: true }]);
      store.saveEntry(e);
      return e;
    },
    remove(id) { setLib((l) => l.filter((x) => x.id !== id)); store.removeEntry(id); },
    saveWiki() { raw.set("dnd5e:wiki", { "2024": H.WIKI["2024"].base, "2014": H.WIKI["2014"].base }); },
  }), []);

  const addChar = (system = newSystem) => {
    const nc = E.newChar("New character", system);
    setChars((cs) => [...cs, nc]); setActiveId(nc.id); setTab("build");
  };

  if (!loaded || !dataFor || (c && !ready)) return (
    <div className="dn"><style>{themeCss(theme)}</style>
      <LoadingScreen text={!loaded || !dataFor ? "Loading your characters…" : `Loading the ${SYSTEMS[need]}…`}
        system={need} slow={slow} error={loadErr} onRetry={() => { setLoadErr(null); setSlow(false); setBootTry((n) => n + 1); }} />
    </div>
  );

  if (!c) return (
    <div className="dn"><style>{themeCss(theme)}</style>
      <div className="wrap" style={{ paddingTop: 48, maxWidth: 520 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-.02em", margin: "0 0 6px" }}>D&amp;D 5e sheet</h1>
        <p className="mut" style={{ marginTop: 0 }}>
          Build a character, level it up one choice at a time, and run it at the table. The 2024 rules bring
          weapon mastery, origin feats, and the lineages; the 2014 rules add Tome of Heroes, Deep Magic, and Vault of Magic.
        </p>
        <div className="chips" style={{ marginBottom: 10 }}>
          {Object.entries(SYSTEMS).map(([k, label]) => (
            <button key={k} className={"pill" + (newSystem === k ? " on" : "")} onClick={() => setNewSystem(k)}>{label}</button>
          ))}
        </div>
        <button className="btn pri" style={{ width: "100%", padding: 12 }} disabled={!ready} onClick={() => addChar()}>Create a character</button>
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Bring in a character from D&amp;D Beyond</h3>
          <ImportPdf onAdd={(ch) => { setChars([ch]); setActiveId(ch.id); setTab("play"); }} />
        </div>
        <ImportBox onImport={(arr) => { setChars(arr); setActiveId(arr[0]?.id); }} />
      </div>
    </div>
  );

  const TABS = [["play", "Sheet"], ["build", "Build"], ["spells", "Spells"], ["gear", "Gear"], ["notes", "Notes"]];
  const hpPct = Math.max(0, Math.min(100, (dv.hp / dv.hpMax) * 100));

  return (
    <div className="dn"><style>{themeCss(theme)}</style>
      <div className="top">
        <div className="topin">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{c.name || "Unnamed"}</div>
            <div className="sub">Level {dv.level} {dv.subrace?.name || dv.race.name} · {dv.classLine} · {dv.system}</div>
          </div>
          <span className="pill" title="Armor Class">AC {dv.ac}</span>
          <span className="pill" title="Hit points" style={{ background: `linear-gradient(90deg,#3a1f1c ${hpPct}%,var(--pan2) ${hpPct}%)` }}>HP {dv.hp}/{dv.hpMax}</span>
          <button className="btn sm" onClick={() => setModal("theme")} aria-label="Change theme">
            <span className="swatch" style={{ background: (THEMES[theme] || {}).dot }} />
          </button>
          <button className="btn sm" onClick={() => setModal("chars")}>Characters</button>
          <button className="btn sm" onClick={() => setLogOpen((v) => !v)}>Rolls</button>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" data-tab={k} aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>
          ))}
          <span className="savest xs mut" data-s={saveState} role="status" title={saveState === "saving" ? "Saving…" : saveState === "err" ? "Not saved" : "Saved"}>
            <span className="savedot" />
            <span className="savelbl">{saveState === "saving" ? "Saving…" : saveState === "err" ? "Not saved" : "Saved"}</span>
          </span>
        </div>
      </div>

      <div className="wrap">
        {tab === "play" && <Play c={c} dv={dv} D={D} setChar={setChar} roll={roll} setModal={setModal} setToast={setToast} />}
        {tab === "build" && <Build c={c} dv={dv} setChar={setChar} setModal={setModal} setToast={setToast} />}
        {tab === "spells" && <Spells c={c} dv={dv} D={D} setChar={setChar} roll={roll} setToast={setToast} libApi={libApi} />}
        {tab === "gear" && <Gear c={c} dv={dv} D={D} setChar={setChar} setToast={setToast} />}
        {tab === "notes" && <Notes c={c} dv={dv} setChar={setChar} chars={chars} setChars={setChars} setActiveId={setActiveId} setToast={setToast} lib={lib} libApi={libApi} />}
      </div>

      {modal === "chars" && (
        <Modal title="Characters" onClose={() => setModal(null)}>
          {chars.map((x) => {
            const xd = (x.system || "2014") === dataFor ? E.derive(x, D) : null;
            return (
              <div className="between" key={x.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line2)" }}>
                <button style={{ textAlign: "left", flex: 1 }} onClick={() => { setActiveId(x.id); setModal(null); }}>
                  <div style={{ fontWeight: 700 }}>{x.name}{x.id === activeId ? <span className="badge gold" style={{ marginLeft: 6 }}>open</span> : null}</div>
                  <div className="mut xs">{xd ? `Level ${xd.level} ${xd.race.name} · ${xd.classLine}` : (x.classes || []).map((cl) => `${cl.cls} ${cl.level}`).join(" / ")} · {SYSTEMS[x.system] || "2014 rules"}</div>
                </button>
              </div>
            );
          })}
          <div className="row wraprow" style={{ marginTop: 12 }}>
            {Object.entries(SYSTEMS).map(([k, label]) => (
              <button key={k} className="btn pri" style={{ flex: 1 }} onClick={() => { addChar(k); setModal(null); }}>New {label.replace(" rules", "")} character</button>
            ))}
          </div>
          <div className="line" />
          <div className="sm" style={{ fontWeight: 700, marginBottom: 6 }}>Import from D&amp;D Beyond</div>
          <ImportPdf onAdd={(ch) => { setChars((cs) => [...cs, ch]); setActiveId(ch.id); setModal(null); setToast(`Imported ${ch.name}`); }} />
        </Modal>
      )}
      {modal?.kind === "levelup" && (
        <LevelUpModal c={c} dv={dv} initialCls={modal.cls} onClose={() => setModal(null)}
          onApply={(cls, answers) => {
            const before = dv.level;
            setChar((x) => E.applyLevelUp(x, D, cls, answers));
            setModal(null); setToast(`Reached level ${before + 1}`);
          }} />
      )}
      {modal === "theme" && (
        <Modal title="Theme" onClose={() => setModal(null)}>
          {Object.entries(THEMES).map(([k, t]) => (
            <button key={k} className={"opt" + (theme === k ? " on" : "")} onClick={() => setTheme(k)}>
              <div className="row">
                <span className="swatch" style={{ background: t.dot }} />
                <strong style={{ fontFamily: "var(--fontd)" }}>{t.name}</strong>
                {theme === k ? <span className="badge gold" style={{ marginLeft: "auto" }}>in use</span> : null}
              </div>
              <div className="mut xs" style={{ marginTop: 4 }}>{t.blurb}</div>
            </button>
          ))}
          <div className="between" style={{ marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div className="sm" style={{ fontWeight: 600 }}>Animate dice rolls</div>
              <div className="mut xs">A tumbling die on every check. Gritty Mario throws in a critter who gets flattened on a natural 20.</div>
            </div>
            <button className={"btn sm" + (animate ? " pri" : "")} onClick={() => setAnimate((v) => !v)}>{animate ? "On" : "Off"}</button>
          </div>
        </Modal>
      )}
      {modal === "conditions" && <ConditionsModal c={c} dv={dv} setChar={setChar} onClose={() => setModal(null)} />}
      {modal === "effects" && <EffectsModal c={c} setChar={setChar} onClose={() => setModal(null)} />}
      {modal === "rest" && <RestModal c={c} dv={dv} setChar={setChar} roll={roll} setToast={setToast} onClose={() => setModal(null)} />}
      {modal === "dice" && <DiceTray onClose={() => setModal(null)} onRoll={(pool, mod, keep, label) => roll(rollPool(pool, mod, keep, label))} />}
      {dice && <DiceOverlay roll={dice} theme={theme} onDone={() => setDice(null)} />}
      {logOpen && (
        <div className="log" ref={logRef}>
          <div className="between" style={{ marginBottom: 4 }}>
            <strong className="sm">Roll log</strong>
            <div className="row">
              <button className="btn sm" onClick={() => setLog([])}>Clear</button>
              <button className="btn sm" onClick={() => setLogOpen(false)}>Hide</button>
            </div>
          </div>
          {log.length === 0 && <div className="empty">Tap any number on the Play tab to roll it.</div>}
          {log.map((r) => (
            <div className="logline" key={r.id}>
              <span className={r.crit ? "crit" : r.fumble ? "fumble" : ""}>
                {r.label}
                {r.dmg ? null : <span className="mut xs"> d20 {r.nat} {sgn(r.mod || 0)}</span>}
                {r.detail ? <span className="mut xs"> {r.detail}</span> : null}
              </span>
              <strong className={"big " + (r.crit ? "crit" : r.fumble ? "fumble" : "")}>{r.total}</strong>
            </div>
          ))}
        </div>
      )}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

// ================================================================ BUILD
function Build({ c, dv, setChar, setModal, setToast }) {
  return (
    <>
      {dv.warnings.length > 0 && (
        <div className="card" style={{ borderColor: "var(--wrnbd)" }}>
          <h3>Needs attention</h3>
          {dv.warnings.map((w) => <div key={w} className="warn">{w}</div>)}
        </div>
      )}
      <div className="cols">
        <div>
          <IdentityCard c={c} setChar={setChar} dv={dv} />
          <RaceCard c={c} dv={dv} setChar={setChar} />
          <BackgroundCard c={c} dv={dv} setChar={setChar} />
        </div>
        <div>
          <AbilityCard c={c} dv={dv} setChar={setChar} />
          <ClassesCard c={c} dv={dv} setChar={setChar} setModal={setModal} setToast={setToast} />
          <ExpertiseCard c={c} dv={dv} setChar={setChar} />
        </div>
      </div>
      <FeaturesCard c={c} dv={dv} setChar={setChar} />
      <ProficiencyCard c={c} dv={dv} setChar={setChar} />
      <CustomCard c={c} setChar={setChar} />
      <AdjustmentsCard c={c} setChar={setChar} />
    </>
  );
}

function IdentityCard({ c, setChar, dv }) {
  return (
    <div className="card" data-card="identity">
      <h3 data-icon="gem">Identity</h3>
      <Field label="Character name"><input value={c.name} onChange={(e) => setChar(() => ({ name: e.target.value }))} /></Field>
      <div className="grid g2">
        <Field label="Player"><input value={c.player} onChange={(e) => setChar(() => ({ player: e.target.value }))} /></Field>
        <Field label="Alignment">
          <select value={c.alignment} onChange={(e) => setChar(() => ({ alignment: e.target.value }))}>
            <option value="">—</option>
            {["Lawful good", "Neutral good", "Chaotic good", "Lawful neutral", "True neutral", "Chaotic neutral", "Lawful evil", "Neutral evil", "Chaotic evil", "Unaligned"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
      </div>
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="sm mut">Ruleset</span>
        <span className="badge gold">{dv.system === "2024" ? "2024 rules" : "2014 rules"}</span>
      </div>
      <Field label="Experience points" hint={dv.nextLevelXp != null ? `${dv.nextLevelXp.toLocaleString()} XP for level ${dv.level + 1}` + (dv.xpLevel > dv.level ? " — you have enough to level up" : "") : "Level 20"}>
        <input type="number" inputMode="numeric" min="0" value={c.xp || 0} onChange={(e) => setChar(() => ({ xp: Math.max(0, +e.target.value || 0) }))} />
      </Field>
    </div>
  );
}

function RaceCard({ c, dv, setChar }) {
  const race = dv.race, sub = dv.subrace;
  const rc = c.raceChoices || {};
  const setRc = (k, v) => setChar((x) => ({ raceChoices: { ...(x.raceChoices || {}), [k]: v } }));
  const asiText = (asi) => Object.entries(asi || {}).map(([a, n]) => `${ABILNAME[a]} ${sgn(n)}`).join(", ");
  const choiceTraits = [...race.traits, ...(sub?.traits || [])].filter((t) => t.choose);
  return (
    <div className="card" data-card="race">
      <h3 data-icon="star">{D.SYSTEM === "2024" ? "Species" : "Race"}</h3>
      <div className="grid g2">
        <Field label={D.SYSTEM === "2024" ? "Species" : "Race"}>
          <select value={race.key} onChange={(e) => setChar(() => ({ race: e.target.value, subrace: (D.RACES.find((r) => r.key === e.target.value)?.subraces[0]?.key) || "", raceChoices: {} }))}>
            <Opts list={D.RACES} />
            <option value="__custom">{D.SYSTEM === "2024" ? "Species" : "Race"} from another book…</option>
          </select>
        </Field>
        <Field label={D.SYSTEM === "2024" ? "Lineage" : "Subrace"}>
          <select value={c.subrace} disabled={!race.subraces.length} onChange={(e) => setChar((x) => ({ subrace: e.target.value, raceChoices: { ...(x.raceChoices || {}), subAsi: [] } }))}>
            {!race.subraces.length ? <option value="">None</option> : null}
            {race.subraces.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="sm mut" style={{ marginBottom: 8 }}>
        {[asiText(race.asi), asiText(sub?.asi)].filter(Boolean).join(", ")
          || (D.SYSTEM === "2024" ? "Ability increases come from your background" : "No fixed ability bonuses")} · Speed {sub?.speed || race.speed} ft · {race.size}
        {" "}<span className="badge">{SRC_SHORT[race.source]}</span>
      </div>
      {race.key === "__custom" && <CustomRaceEditor c={c} setChar={setChar} />}
      {race.asiChoose && (
        <Field label={<span>Choose {race.asiChoose.n} to increase by {race.asiChoose.bonus} <Count have={(rc.asi || []).length} need={race.asiChoose.n} /></span>}>
          <Chips max={race.asiChoose.n} value={rc.asi || []} onChange={(v) => setRc("asi", v)}
            options={race.asiChoose.from.map((a) => ({ value: a, label: ABILNAME[a] }))} />
        </Field>
      )}
      {sub?.asiChoose && (
        <Field label={<span>{sub.name}: choose {sub.asiChoose.n} to increase by {sub.asiChoose.bonus} <Count have={(rc.subAsi || []).length} need={sub.asiChoose.n} /></span>}>
          <Chips max={sub.asiChoose.n} value={rc.subAsi || []} onChange={(v) => setRc("subAsi", v)}
            options={sub.asiChoose.from.map((a) => ({ value: a, label: ABILNAME[a] }))} />
        </Field>
      )}
      {choiceTraits.map((t) => {
        const from = t.choose.from === "any-skill" ? SKILL_LIST.map((s) => s[0]) : t.choose.from;
        const v = [].concat(rc[t.name] || []);
        return (
          <Field key={t.name} label={<span>{t.name}: choose {t.choose.n} <Count have={v.length} need={t.choose.n} /></span>}>
            <Chips max={t.choose.n} value={v} onChange={(nv) => setRc(t.name, nv)} options={from.map((k) => ({ value: k, label: SKILLNAME[k] || k }))} />
          </Field>
        );
      })}
      <div className="line" />
      {[...race.traits, ...(sub?.traits || [])].map((t) => <Feature key={t.name} name={t.name} desc={t.desc} />)}
      {!race.traits.length && !(sub?.traits || []).length && <div className="mut sm">This race has no traits in the source data. Add them as custom features below.</div>}
    </div>
  );
}

function bgChoice(bg) {
  if (!bg) return { need: 0, from: [] };
  const need = Math.max(0, 2 - bg.skills.length);
  if (!need) return { need: 0, from: [] };
  const t = (bg.skillText || "").toLowerCase();
  const named = SKILL_LIST.map((s) => s[0]).filter((k) => !bg.skills.includes(k) && t.includes(SKILLNAME[k].toLowerCase()));
  return { need, from: named.length >= need ? named : SKILL_LIST.map((s) => s[0]).filter((k) => !bg.skills.includes(k)) };
}

function BackgroundCard({ c, dv, setChar }) {
  const bg = dv.background;
  const ch = bgChoice(bg);
  return (
    <div className="card" data-card="background">
      <h3 data-icon="book">Background</h3>
      <Field label="Background">
        <select value={c.background} onChange={(e) => setChar(() => ({ background: e.target.value, bgSkillPicks: [] }))}>
          <Opts list={D.BACKGROUNDS} />
          <option value="__custom">Background from another book…</option>
        </select>
      </Field>
      {c.background === "__custom" && <CustomBgEditor c={c} setChar={setChar} />}
      {bg && (
        <>
          <div className="sm" style={{ marginBottom: 6 }}>
            <span className="mut">Skills </span>{bg.skills.map((k) => SKILLNAME[k]).join(", ") || "—"}
            {bg.tools ? <><span className="mut"> · Tools </span>{bg.tools}</> : null}
            {bg.languages ? <><span className="mut"> · Languages </span>{bg.languages}</> : null}
          </div>
          {ch.need > 0 && (
            <Field label={<span>Choose {ch.need} more {ch.need === 1 ? "skill" : "skills"} <Count have={(c.bgSkillPicks || []).length} need={ch.need} /></span>} hint={bg.skillText}>
              <Chips max={ch.need} value={c.bgSkillPicks || []} onChange={(v) => setChar(() => ({ bgSkillPicks: v }))} options={skillOpts(ch.from)} />
            </Field>
          )}
          {D.SYSTEM === "2024" && bg.abilityOptions?.length > 0 && <BackgroundAbilities c={c} bg={bg} setChar={setChar} />}
          {D.SYSTEM === "2024" && bg.feat && (
            <Feature name={bg.feat.name + (bg.feat.note ? ` (${bg.feat.note})` : "")} right={<span className="badge gold">Origin feat</span>}
              desc={(D.FEATS.find((x) => x.key === bg.feat.key) || {}).desc} />
          )}
          {bg.equipment ? <div className="xs mut" style={{ marginBottom: 6 }}>Equipment: {bg.equipment}</div> : null}
          {bg.feature && <Feature name={bg.feature.name} desc={bg.feature.desc} right={<span className="badge">Feature</span>} />}
          {bg.desc && <Feature name="About this background" desc={bg.desc} />}
        </>
      )}
    </div>
  );
}

function CustomRaceEditor({ c, setChar }) {
  const r = c.customRace || {};
  const set = (patch) => setChar((x) => ({ customRace: { ...(x.customRace || {}), ...patch } }));
  const traits = r.traits || [];
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radsm)", padding: 10, marginBottom: 10 }}>
      <Field label="Race name"><input value={r.name || ""} placeholder="Imperial" onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Speed (feet)"><input type="number" inputMode="numeric" value={r.speed ?? 30} onChange={(e) => set({ speed: +e.target.value || 0 })} /></Field>
        <Field label="Size">
          <select value={r.size || "Medium"} onChange={(e) => set({ size: e.target.value })}><option>Small</option><option>Medium</option></select>
        </Field>
      </div>
      <Field label="Ability score increases">
        <div className="grid g3">
          {ABIL.map((a) => (
            <div className="ab" key={a}>
              <div className="lb">{ABILNAME[a]}</div>
              <div className="stepper">
                <button aria-label={"Lower " + ABILNAME[a]} disabled={!(r.asi?.[a] > 0)} onClick={() => { const n = { ...(r.asi || {}) }; n[a] = (n[a] || 0) - 1; if (!n[a]) delete n[a]; set({ asi: n }); }}>−</button>
                <span className="sm" style={{ minWidth: 18 }}>{sgn(r.asi?.[a] || 0)}</span>
                <button aria-label={"Raise " + ABILNAME[a]} onClick={() => set({ asi: { ...(r.asi || {}), [a]: (r.asi?.[a] || 0) + 1 } })}>+</button>
              </div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="Languages"><input value={r.languages || ""} placeholder="Common and one extra language" onChange={(e) => set({ languages: e.target.value })} /></Field>
      <div className="xs mut" style={{ marginBottom: 4 }}>Traits</div>
      {traits.map((t, i) => (
        <div className="row" key={i} style={{ marginBottom: 6, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <input value={t.name} placeholder="Trait name" onChange={(e) => { const n = [...traits]; n[i] = { ...t, name: e.target.value }; set({ traits: n }); }} />
            <textarea rows={2} style={{ marginTop: 4 }} value={t.desc} placeholder="What it does" onChange={(e) => { const n = [...traits]; n[i] = { ...t, desc: e.target.value }; set({ traits: n }); }} />
          </div>
          <button className="btn sm dan" onClick={() => set({ traits: traits.filter((x, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => set({ traits: [...traits, { name: "", desc: "" }] })}>Add a trait</button>
    </div>
  );
}

function CustomBgEditor({ c, setChar }) {
  const b = c.customBackground || {};
  const set = (patch) => setChar((x) => ({ customBackground: { ...(x.customBackground || {}), ...patch } }));
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radsm)", padding: 10, marginBottom: 10 }}>
      <Field label="Background name"><input value={b.name || ""} placeholder="Apprentice" onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Tools"><input value={b.tools || ""} onChange={(e) => set({ tools: e.target.value })} /></Field>
        <Field label="Languages"><input value={b.languages || ""} onChange={(e) => set({ languages: e.target.value })} /></Field>
      </div>
      <Field label="Feature name"><input value={b.featureName || ""} onChange={(e) => set({ featureName: e.target.value })} /></Field>
      <Field label="Feature text"><textarea rows={2} value={b.featureDesc || ""} onChange={(e) => set({ featureDesc: e.target.value })} /></Field>
    </div>
  );
}

const ADJUSTMENTS = [["acSet", "Armor Class, set by hand"], ["ac", "Armor Class bonus"], ["saves", "All saving throws"], ["init", "Initiative"], ["speed", "Speed (feet)"], ["hpPerLevel", "Hit points per level"], ["hpFlat", "Hit points, flat"], ["spellDC", "Spell save DC"], ["spellAtk", "Spell attack"]];

function AdjustmentsCard({ c, setChar }) {
  const b = c.bonuses || {};
  const set = (k, v) => setChar((x) => ({ bonuses: { ...(x.bonuses || {}), [k]: v } }));
  return (
    <div className="card" data-card="adjust">
      <h3 data-icon="box">Manual adjustments</h3>
      <div className="xs mut" style={{ marginBottom: 8 }}>For anything the app doesn't calculate yet — a Ring of Protection, a racial hit point bonus, a DM ruling. These add to the numbers on your sheet.</div>
      <div className="grid g2">
        {ADJUSTMENTS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="number" inputMode="numeric" value={b[k] || 0} onChange={(e) => set(k, +e.target.value || 0)} />
          </Field>
        ))}
      </div>
    </div>
  );
}

// 2024: a background offers three abilities; you take +2/+1 or +1/+1/+1.
function BackgroundAbilities({ c, bg, setChar }) {
  const picks = c.bgAbility || [];
  const spread = picks.length === 3 ? "1/1/1" : "2/1";
  const set = (v) => setChar(() => ({ bgAbility: v }));
  return (
    <Field label={<span>Ability increases <Count have={picks.length} need={spread === "2/1" ? 2 : 3} /></span>}
      hint={spread === "2/1" ? "First pick gets +2, second gets +1." : "Each pick gets +1."}>
      <div className="chips" style={{ marginBottom: 6 }}>
        <button className={"pill" + (spread === "2/1" ? " on" : "")} onClick={() => set(picks.slice(0, 2))}>+2 and +1</button>
        <button className={"pill" + (spread === "1/1/1" ? " on" : "")} onClick={() => set([...picks, ""].slice(0, 3).filter(Boolean))}>+1 to three</button>
      </div>
      <div className="chips">
        {bg.abilityOptions.map((a) => {
          const i = picks.indexOf(a);
          return (
            <button key={a} className={"pill" + (i >= 0 ? " on" : "")}
              onClick={() => set(i >= 0 ? picks.filter((x) => x !== a) : [...picks, a].slice(0, spread === "2/1" ? 2 : 3))}>
              {ABILNAME[a]}{i >= 0 ? ` ${sgn(spread === "2/1" && i === 0 ? 2 : 1)}` : ""}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function AbilityCard({ c, dv, setChar }) {
  const method = c.abilityMethod || "standard";
  const base = c.base || {};
  const setBase = (a, v) => setChar((x) => ({ base: { ...(x.base || {}), [a]: v } }));
  const spent = E.pointBuySpent(base);
  const used = ABIL.map((a) => base[a]);
  const arrayDupes = method === "standard" && E.STANDARD_ARRAY.some((v) => used.filter((u) => u === v).length > 1);
  const bonus = (a) => dv.ab[a] - (+base[a] || 10);
  return (
    <div className="card" data-card="ability">
      <div className="between"><h3 data-icon="gem">Ability scores</h3>
        <select value={method} style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
          onChange={(e) => {
            const m = e.target.value;
            const nb = m === "standard" ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } : m === "pointbuy" ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } : { ...base };
            setChar(() => ({ abilityMethod: m, base: nb }));
          }}>
          <option value="standard">Standard array</option>
          <option value="pointbuy">Point buy</option>
          <option value="manual">Rolled or manual</option>
        </select>
      </div>
      {method === "pointbuy" && <div className={spent > E.POINT_BUY_BUDGET ? "warn" : "sm mut"} style={{ marginBottom: 8 }}>{E.POINT_BUY_BUDGET - spent} of {E.POINT_BUY_BUDGET} points left</div>}
      {arrayDupes && <div className="warn">Each standard array value (15, 14, 13, 12, 10, 8) should be used once.</div>}
      {method === "manual" && (
        <button className="btn sm" style={{ marginBottom: 8 }} onClick={() => setChar(() => ({ base: Object.fromEntries(ABIL.map((a) => [a, roll4d6()])) }))}>Roll 4d6, drop lowest</button>
      )}
      <details className="ft" style={{ marginBottom: 6 }}>
        <summary><span className="ttl sm">An item sets one of my scores</span></summary>
        <div className="xs mut" style={{ margin: "6px 0" }}>Gauntlets of Ogre Power, a Headband of Intellect, and the like. The higher of this and your own score is used.</div>
        <div className="grid g3">
          {ABIL.map((a) => (
            <Field key={a} label={ABILNAME[a]}>
              <input type="number" inputMode="numeric" min="0" max="30" placeholder="—" value={(c.scoreOverride || {})[a] || ""}
                onChange={(e) => setChar((x) => { const o = { ...(x.scoreOverride || {}) }; if (+e.target.value) o[a] = +e.target.value; else delete o[a]; return { scoreOverride: o }; })} />
            </Field>
          ))}
        </div>
      </details>
      <div className="grid g3">
        {ABIL.map((a) => (
          <div className="ab" key={a}>
            <div className="lb">{ABILNAME[a]}</div>
            <div className="sc">{dv.ab[a]}</div>
            <div className="md2">{sgn(dv.m[a])}</div>
            {method === "standard" && (
              <select aria-label={ABILNAME[a] + " base"} value={base[a]} style={{ marginTop: 6, padding: "4px 6px", fontSize: 13 }} onChange={(e) => setBase(a, +e.target.value)}>
                {E.STANDARD_ARRAY.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {method === "pointbuy" && (
              <div className="stepper">
                <button aria-label={"Lower " + ABILNAME[a]} disabled={base[a] <= 8} onClick={() => setBase(a, base[a] - 1)}>−</button>
                <span className="sm" style={{ minWidth: 20 }}>{base[a]}</span>
                <button aria-label={"Raise " + ABILNAME[a]} disabled={base[a] >= 15 || spent + (E.POINT_BUY_COST[base[a] + 1] - E.POINT_BUY_COST[base[a]]) > E.POINT_BUY_BUDGET} onClick={() => setBase(a, base[a] + 1)}>+</button>
              </div>
            )}
            {method === "manual" && (
              <input aria-label={ABILNAME[a] + " base"} type="number" inputMode="numeric" min="1" max="30" value={base[a] ?? 10} style={{ marginTop: 6, textAlign: "center", padding: "4px" }} onChange={(e) => setBase(a, Math.max(1, Math.min(30, +e.target.value || 0)))} />
            )}
            <div className="xs mut" style={{ marginTop: 4 }}>{bonus(a) ? `base ${base[a]} ${sgn(bonus(a))}` : "base " + base[a]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- classes
function removeLevel(x, clsKey) {
  const classes = (x.classes || []).map((cl) => ({ ...cl, hp: [...(cl.hp || [])], asi: { ...(cl.asi || {}) } }));
  const i = classes.findIndex((cl) => cl.cls === clsKey); if (i < 0) return {};
  const cl = classes[i];
  delete cl.asi[cl.level]; cl.hp.length = Math.min(cl.hp.length, cl.level - 1);
  cl.level -= 1;
  if (cl.level < (D.CLASSES[cl.cls]?.subclassLevel || 3)) cl.subclass = "";
  if (cl.level <= 0) classes.splice(i, 1);
  return { classes };
}

function AsiEditor({ value, onChange, dv }) {
  const v = value || { type: "asi", picks: [] };
  const feat = v.type === "feat" && v.feat && v.feat !== "__custom" ? D.FEATS.find((f) => f.key === v.feat) : null;
  const halfOpts = feat ? E.featAbilityOptions(feat) : [];
  return (
    <div>
      <div className="chips" style={{ marginBottom: 7 }}>
        <button className={"pill" + (v.type === "asi" ? " on" : "")} onClick={() => onChange({ type: "asi", picks: [] })}>Ability scores</button>
        <button className={"pill" + (v.type === "feat" ? " on" : "")} onClick={() => onChange({ type: "feat", feat: "", picks: [] })}>Feat</button>
      </div>
      {v.type === "asi" && (
        <div className="grid g2">
          {[0, 1].map((i) => (
            <select key={i} aria-label={"Increase " + (i + 1)} value={v.picks?.[i] || ""} onChange={(e) => { const p = [v.picks?.[0] || "", v.picks?.[1] || ""]; p[i] = e.target.value; onChange({ ...v, picks: p }); }}>
              <option value="">+1 to…</option>
              {ABIL.map((a) => <option key={a} value={a} disabled={dv && dv.ab[a] >= 20 && v.picks?.[i] !== a}>{ABILNAME[a]} ({dv?.ab[a]})</option>)}
            </select>
          ))}
          <div className="xs mut" style={{ gridColumn: "1/-1" }}>Pick the same ability twice for +2. Scores cap at 20.</div>
        </div>
      )}
      {v.type === "feat" && (
        <>
          <select value={v.feat || ""} onChange={(e) => onChange({ type: "feat", feat: e.target.value, picks: [] })}>
            <option value="">Choose a feat</option>
            <Opts list={D.FEATS} />
            <option value="__custom">A feat from another book…</option>
          </select>
          {v.feat === "__custom" && (
            <div style={{ marginTop: 7 }}>
              <input placeholder="Feat name (e.g. War Caster)" value={v.customName || ""} onChange={(e) => onChange({ ...v, customName: e.target.value })} />
              <textarea rows={3} style={{ marginTop: 6 }} placeholder="What it does (optional)" value={v.customDesc || ""} onChange={(e) => onChange({ ...v, customDesc: e.target.value })} />
              <select style={{ marginTop: 6 }} value={v.picks?.[0] || ""} onChange={(e) => onChange({ ...v, picks: e.target.value ? [e.target.value] : [] })}>
                <option value="">No ability increase</option>
                {ABIL.map((a) => <option key={a} value={a}>+1 {ABILNAME[a]}</option>)}
              </select>
            </div>
          )}
          {feat && (
            <>
              {feat.prereq ? <div className="xs mut" style={{ marginTop: 5 }}>Prerequisite: {feat.prereq}</div> : null}
              {halfOpts.length > 0 && (
                <div style={{ marginTop: 7 }}>
                  <div className="xs mut" style={{ marginBottom: 4 }}>This feat raises one score by 1</div>
                  <Chips max={1} value={v.picks || []} onChange={(p) => onChange({ ...v, picks: p })} options={halfOpts.map((a) => ({ value: a, label: ABILNAME[a] }))} />
                </div>
              )}
              <Feature name="Feat text" desc={feat.desc} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClassesCard({ c, dv, setChar, setModal, setToast }) {
  const total = dv.level;
  return (
    <div className="card" data-card="classes">
      <div className="between"><h3 data-icon="shield">Classes</h3><span className="sm mut">Level {total} · proficiency {sgn(dv.pb)}</span></div>
      {(c.classes || []).map((cl, i) => <ClassBox key={cl.cls} c={c} dv={dv} cl={cl} i={i} setChar={setChar} setModal={setModal} setToast={setToast} />)}
      <div className="row wraprow">
        <button className="btn pri" disabled={total >= 20} onClick={() => setModal({ kind: "levelup", cls: (c.classes || []).length === 1 ? c.classes[0].cls : null })}>Level up</button>
        <button className="btn" disabled={total >= 20} onClick={() => setModal({ kind: "levelup", cls: null, multiclass: true })}>Add a class</button>
      </div>
    </div>
  );
}

function ClassBox({ c, dv, cl, i, setChar, setToast }) {
  const C = D.CLASSES[cl.cls];
  const sc = E.findSubclass(D, cl.cls, cl.subclass);
  const updateCl = (patch) => setChar((x) => ({ classes: x.classes.map((y) => (y.cls === cl.cls ? { ...y, ...patch } : y)) }));
  const asiLevels = C.levels.filter((row, idx) => row.level <= cl.level && idx > 0 && row.asi > C.levels[idx - 1].asi).map((r) => r.level);
  const optionFeatures = dv.features.filter((f) => f.cls === cl.cls && f.options);
  const invocationsKnown = cl.cls === "warlock" ? C.levels[cl.level - 1].cs.invocations_known : 0;
  const onlyL1 = dv.level === 1 && i === 0;
  const avg = Math.floor(C.hd / 2) + 1;
  const skillsNeed = i === 0 ? C.skillChoose : C.mcSkills;

  return (
    <div className="clsbox">
      <div className="between" style={{ marginBottom: 8 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{C.name} {cl.level}</strong>
          <span className="xs mut"> · d{C.hd}{i === 0 ? " · starting class" : ""}</span>
        </div>
        <button className="btn sm" disabled={dv.level <= 1} onClick={() => { setChar((x) => removeLevel(x, cl.cls)); setToast(`Removed a ${C.name} level`); }}>Remove a level</button>
      </div>
      {onlyL1 && (
        <Field label="Class">
          <select value={cl.cls} onChange={(e) => setChar(() => ({ classes: [{ cls: e.target.value, level: 1, subclass: "", hp: [], skills: [], asi: {} }], choices: {}, expertise: [], spells: [] }))}>
            {Object.entries(D.CLASSES).map(([k, x]) => <option key={k} value={k}>{x.name}</option>)}
          </select>
        </Field>
      )}
      {cl.level >= C.subclassLevel ? (
        <Field label={C.subclassLabel}>
          <select value={cl.subclass || ""} onChange={(e) => updateCl({ subclass: e.target.value })}>
            <option value="">Choose…</option>
            <Opts list={D.SUBCLASSES.filter((s) => s.cls === cl.cls)} />
            <option value="__custom">{C.subclassLabel} from another book…</option>
          </select>
        </Field>
      ) : <div className="xs mut" style={{ marginBottom: 8 }}>{C.subclassLabel} at {C.name.toLowerCase()} level {C.subclassLevel}</div>}
      {cl.subclass === "__custom" && (
        <>
          <Field label={C.subclassLabel + " name"}><input value={cl.subclassName || ""} placeholder="Wild Magic" onChange={(e) => updateCl({ subclassName: e.target.value })} /></Field>
          <div className="xs mut" style={{ marginBottom: 8 }}>Add its features one at a time under Custom features, so their uses show up on your sheet.</div>
        </>
      )}
      {sc && sc.desc && <Feature name={"About " + sc.name} desc={sc.desc} right={<span className="badge">{SRC_SHORT[sc.source]}</span>} />}

      {skillsNeed > 0 && (
        <Field label={<span>{i === 0 ? "Class skills" : "Multiclass skill"} <Count have={(cl.skills || []).length} need={skillsNeed} /></span>}>
          <Chips max={skillsNeed} value={cl.skills || []} onChange={(v) => updateCl({ skills: v })} options={skillOpts(C.skillFrom)} />
        </Field>
      )}

      <Field label="Hit points per level" hint={`Blank = average (${avg}). Constitution ${sgn(dv.m.con)} is added to each level.`}>
        <div className="hpcells">
          {Array.from({ length: cl.level }).map((_, li) =>
            i === 0 && li === 0 ? <span key={li} className="fixed" title="1st level is always the maximum">{C.hd}</span> : (
              <input key={li} aria-label={`${C.name} level ${li + 1} hit points`} type="number" inputMode="numeric" min="1" max={C.hd} placeholder={avg}
                value={cl.hp?.[li] ?? ""} onChange={(e) => {
                  const hp = [...(cl.hp || [])]; const n = e.target.value === "" ? null : Math.max(1, Math.min(C.hd, +e.target.value));
                  hp[li] = n; updateCl({ hp });
                }} />
            ))}
        </div>
      </Field>

      {D.SYSTEM === "2024" && (C.levels[cl.level - 1]?.cs?.weapon_mastery > 0) && (() => {
        const n = C.levels[cl.level - 1].cs.weapon_mastery;
        const chosen = (c.masteries || {})[cl.cls] || [];
        return (
          <Field key="mastery" label={<span>Weapon Mastery <Count have={chosen.length} need={n} /></span>}
            hint="The mastery property of each weapon you choose is active while you wield it.">
            <Chips max={n} value={chosen} onChange={(v) => setChar((x) => ({ masteries: { ...(x.masteries || {}), [cl.cls]: v } }))}
              options={D.WEAPONS.filter((w) => w.mastery).map((w) => ({ value: w.name, label: `${w.name} · ${w.mastery}`, title: D.WEAPON_MASTERY?.[w.mastery.toLowerCase()]?.desc }))} />
          </Field>
        );
      })()}
      {asiLevels.map((lv) => (
        <Field key={lv} label={`${C.name} ${lv}: ability score improvement or feat`}>
          <AsiEditor dv={dv} value={cl.asi?.[lv]} onChange={(v) => updateCl({ asi: { ...(cl.asi || {}), [lv]: v } })} />
        </Field>
      ))}

      {optionFeatures.map((f) => {
        const n = f.name === "Eldritch Invocations" ? invocationsKnown : 1;
        const val = [].concat(c.choices?.[f.key] || []);
        return (
          <Field key={f.key} label={<span>{f.name} <Count have={val.length} need={n} /></span>}>
            <Chips max={n} value={val} onChange={(v) => setChar((x) => ({ choices: { ...(x.choices || {}), [f.key]: v } }))}
              options={f.options.map((o) => ({ value: o.name, label: o.name.replace(/^[^:]+: /, ""), title: o.desc.slice(0, 200) }))} />
          </Field>
        );
      })}
    </div>
  );
}

function ExpertiseCard({ c, dv, setChar }) {
  const slots = dv.features.filter((f) => f.kind === "class" && /^Expertise$/.test(f.name)).length * 2;
  if (!slots) return null;
  const proficient = Object.entries(dv.skills).filter(([, s]) => s.prof >= 1).map(([k]) => k);
  const val = (c.expertise || []).filter((k) => proficient.includes(k));
  return (
    <div className="card">
      <div className="between"><h3 data-icon="star">Expertise</h3><Count have={val.length} need={slots} /></div>
      <div className="xs mut" style={{ marginBottom: 7 }}>Double your proficiency bonus for these skills. Choose from skills you're proficient in.</div>
      <Chips max={slots} value={val} onChange={(v) => setChar(() => ({ expertise: v }))} options={skillOpts(proficient)} />
      {!proficient.length && <div className="mut sm">Pick class and background skills first.</div>}
    </div>
  );
}

function FeaturesCard({ dv }) {
  const groups = [
    ["Class", dv.features.filter((f) => ["class", "option"].includes(f.kind))],
    ["Subclass", dv.features.filter((f) => f.kind === "subclass")],
    ["Feats", dv.features.filter((f) => f.kind === "feat")],
    ["Custom", dv.features.filter((f) => f.kind === "custom")],
  ].filter(([, l]) => l.length);
  return (
    <div className="card">
      <h3 data-icon="flag">Features</h3>
      {!groups.length && <div className="empty">Features from your class, subclass, and feats will appear here.</div>}
      <div className="cols">
        {groups.map(([g, list]) => (
          <div key={g}>
            <div className="sm mut" style={{ fontWeight: 700, margin: "4px 0 2px" }}>{g}</div>
            {list.map((f) => (
              <Feature key={f.key} name={f.name} desc={f.desc}
                right={<>{f.level ? <span className="badge">{ordinal(f.level)}</span> : null}{f.kind !== "class" && f.from ? <span className="badge">{f.from}</span> : null}</>} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProficiencyCard({ c, dv, setChar }) {
  const [draft, setDraft] = useState("");
  const langs = c.languages || [];
  return (
    <div className="card">
      <h3 data-icon="scroll">Proficiencies and languages</h3>
      <div className="sm" style={{ marginBottom: 6 }}><span className="mut">Armor and weapons: </span>{dv.profs.filter((p) => /armor|shield|weapon/i.test(p)).join(", ") || "—"}</div>
      <div className="sm" style={{ marginBottom: 6 }}><span className="mut">Specific weapons and tools: </span>{dv.profs.filter((p) => !/armor|shield|weapons$/i.test(p)).join(", ") || "—"}</div>
      <div className="sm" style={{ marginBottom: 10 }}><span className="mut">Saving throws: </span>{ABIL.filter((a) => dv.saves[a].prof).map((a) => ABILNAME[a]).join(", ")}</div>
      <div className="cols">
        <Field label="Languages" hint={[dv.race.languages, dv.background?.languages && "Background: " + dv.background.languages].filter(Boolean).join(" · ")}>
          <div className="chips" style={{ marginBottom: 6 }}>
            {langs.map((l) => <button key={l} className="pill on" title="Remove" onClick={() => setChar(() => ({ languages: langs.filter((x) => x !== l) }))}>{l} ×</button>)}
          </div>
          <div className="row">
            <select value={draft} onChange={(e) => setDraft(e.target.value)}>
              <option value="">Add a language…</option>
              {D.LANGUAGES.filter((l) => !langs.includes(l.name)).map((l) => <option key={l.name}>{l.name}</option>)}
            </select>
            <button className="btn sm" disabled={!draft} onClick={() => { setChar(() => ({ languages: [...langs, draft] })); setDraft(""); }}>Add</button>
          </div>
        </Field>
        <Field label="Other proficiencies" hint="Tools, instruments, or anything a feat or your DM grants. One per line.">
          <textarea rows={3} value={(c.extraProfs || []).join("\n")} onChange={(e) => setChar(() => ({ extraProfs: e.target.value.split("\n") }))} onBlur={(e) => setChar(() => ({ extraProfs: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))} />
        </Field>
      </div>
      <Field label="Extra skill or saving throw proficiencies" hint="For feats like Skilled or Resilient.">
        <Chips value={c.extraSkills || []} onChange={(v) => setChar(() => ({ extraSkills: v }))} options={skillOpts(SKILL_LIST.map((s) => s[0]))} />
        <div style={{ height: 6 }} />
        <Chips value={c.extraSaves || []} onChange={(v) => setChar(() => ({ extraSaves: v }))} options={ABIL.map((a) => ({ value: a, label: ABILNAME[a] + " save" }))} />
      </Field>
    </div>
  );
}

function CustomCard({ c, setChar }) {
  const blank = { name: "", source: "", desc: "", max: "", reset: "long" };
  const [f, setF] = useState(blank);
  const list = c.customFeatures || [];
  return (
    <div className="card" data-card="custom">
      <h3 data-icon="flag">Custom features</h3>
      <div className="xs mut" style={{ marginBottom: 8 }}>For anything not in the bundled books, like a Player's Handbook subclass feature or a DM boon. Give it uses and it becomes a tracker on your sheet.</div>
      {list.map((x) => (
        <Feature key={x.id} name={x.name} desc={x.desc || H.libraryText(D, "feature", x.name) || "No text yet. Look it up, then fill it in from the Notes tab."}
          right={<><WikiLinks kind="feature" name={x.name} system={c.system} cls={c.classes?.[0]?.cls} compact />{x.uses?.max ? <span className="badge">{x.uses.max}/{x.uses.reset} rest</span> : null}{x.source ? <span className="badge">{x.source}</span> : null}
            <button className="btn sm dan" onClick={(e) => { e.preventDefault(); setChar(() => ({ customFeatures: list.filter((y) => y.id !== x.id) })); }}>Delete</button></>} />
      ))}
      <div className="line" />
      <div className="grid g2">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Combat Superiority" /></Field>
        <Field label="Source"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Battle Master, PHB" /></Field>
      </div>
      <Field label="Description"><textarea rows={3} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Uses (optional)"><input type="number" inputMode="numeric" min="0" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
        <Field label="Recharges on">
          <select value={f.reset} onChange={(e) => setF({ ...f, reset: e.target.value })}><option value="short">Short rest</option><option value="long">Long rest</option></select>
        </Field>
      </div>
      <button className="btn" disabled={!f.name.trim()} onClick={() => {
        setChar(() => ({ customFeatures: [...list, { id: E.uid(), name: f.name.trim(), source: f.source.trim(), desc: f.desc, ...(+f.max ? { uses: { max: +f.max, reset: f.reset } } : {}) }] }));
        setF(blank);
      }}>Add feature</button>
      <div className="line" />
      <ExtraFeats c={c} setChar={setChar} />
    </div>
  );
}

function ExtraFeats({ c, setChar }) {
  const blank = { name: "", desc: "", pick: "" };
  const [f, setF] = useState(blank);
  const list = c.customFeats || [];
  return (
    <>
      <div className="sm" style={{ fontWeight: 700, marginBottom: 4 }}>Feats you didn't take with an ability score improvement</div>
      <div className="xs mut" style={{ marginBottom: 8 }}>A background feat, a bonus feat, or anything your DM handed you.</div>
      {list.map((x) => (
        <Feature key={x.id} name={x.name} desc={x.desc || H.libraryText(D, "feat", x.name) || "No text yet. Look it up, then fill it in from the Notes tab."}
          right={<><WikiLinks kind="feat" name={x.name} system={c.system} compact />{x.picks?.length ? <span className="badge">+1 {ABILNAME[x.picks[0]]}</span> : null}
            <button className="btn sm dan" onClick={(e) => { e.preventDefault(); setChar(() => ({ customFeats: list.filter((y) => y.id !== x.id) })); }}>Delete</button></>} />
      ))}
      <div className="grid g2">
        <Field label="Feat name"><input value={f.name} placeholder="Strixhaven Initiate" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Ability increase">
          <select value={f.pick} onChange={(e) => setF({ ...f, pick: e.target.value })}>
            <option value="">None</option>
            {ABIL.map((a) => <option key={a} value={a}>+1 {ABILNAME[a]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What it does"><textarea rows={2} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
      <button className="btn" disabled={!f.name.trim()} onClick={() => {
        setChar(() => ({ customFeats: [...list, { id: E.uid(), name: f.name.trim(), desc: f.desc, picks: f.pick ? [f.pick] : [] }] }));
        setF(blank);
      }}>Add feat</button>
    </>
  );
}

// ================================================================ LEVEL UP
function LevelUpModal({ c, dv, initialCls, onClose, onApply }) {
  const [cls, setCls] = useState(initialCls);
  const [a, setA] = useState({});
  const plan = useMemo(() => (cls ? E.levelUpPlan(c, D, cls) : null), [c, cls]);
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }));

  if (!cls) {
    const mine = (c.classes || []).map((x) => x.cls);
    return (
      <Modal title={`Level ${dv.level + 1}`} onClose={onClose}>
        {mine.length > 0 && <div className="sm mut" style={{ marginBottom: 6 }}>Continue a class</div>}
        {mine.map((k) => (
          <button key={k} className="opt" onClick={() => setCls(k)}>
            <strong>{D.CLASSES[k].name} {(c.classes.find((x) => x.cls === k).level) + 1}</strong>
          </button>
        ))}
        <div className="sm mut" style={{ margin: "12px 0 6px" }}>{mine.length ? "Multiclass into" : "Choose a class"}</div>
        {Object.entries(D.CLASSES).filter(([k]) => !mine.includes(k)).map(([k, C]) => {
          const ok = !mine.length || (E.multiclassOk(D, k, dv.ab) && mine.every((m) => E.multiclassOk(D, m, dv.ab)));
          const pre = C.mcPrereq?.all ? C.mcPrereq.all.map(([x, n]) => `${x.toUpperCase()} ${n}`).join(" and ") : C.mcPrereq?.any?.map(([x, n]) => `${x.toUpperCase()} ${n}`).join(" or ");
          return (
            <button key={k} className="opt" onClick={() => setCls(k)}>
              <div className="between"><strong>{C.name}</strong>{mine.length ? <span className={"badge" + (ok ? "" : " gold")}>{ok ? "Meets " : "Needs "}{pre}</span> : null}</div>
            </button>
          );
        })}
      </Modal>
    );
  }

  const C = D.CLASSES[cls];
  const steps = plan.steps;
  // preview the character with non-spell answers applied, so spell pickers know the right list and levels
  const preview = E.applyLevelUp(c, D, cls, { ...a, spells: [], cantrips: [] });
  const pdv = E.derive(preview, D);
  const known = new Set((c.spells || []).map((s) => s.name));
  const caster = pdv.spell.casters.find((k) => k.cls === cls);
  const row = C.levels[plan.newLevel - 1];
  const maxSlot = cls === "warlock" ? pdv.spell.pact?.level || 1 : Math.max(1, (row.slots || []).reduce((h, n, i) => (n > 0 ? i + 1 : h), 0));
  const proficientAfter = Object.entries(pdv.skills).filter(([, s]) => s.prof >= 1).map(([k]) => k);

  const incomplete = steps.filter((s) => {
    if (s.kind === "skills") return (a.skills || []).length < s.n;
    if (s.kind === "subclass") return !a.subclass;
    if (s.kind === "option") return [].concat(a.options?.[s.key] || []).length < s.n;
    if (s.kind === "expertise") return (a.expertise || []).length < s.n;
    if (s.kind === "asi") return !a.asi || (a.asi.type === "asi" ? (a.asi.picks || []).filter(Boolean).length < 2 : !a.asi.feat);
    if (s.kind === "cantrips") return (a.cantrips || []).length < s.n;
    if (s.kind === "spells") return (a.spells || []).length < s.n;
    return false;
  }).length;

  const hpStep = steps.find((s) => s.kind === "hp");
  const hpGain = Math.max(1, (hpStep.fixed ?? a.hp ?? hpStep.average) + pdv.m.con);

  return (
    <Modal title={`${C.name} ${plan.newLevel}`} onClose={onClose}
      footer={
        <div className="between">
          <span className="sm mut">{incomplete ? `${incomplete} choice${incomplete > 1 ? "s" : ""} left — you can finish later on the Build tab` : "All set"}</span>
          <button className="btn pri" onClick={() => onApply(cls, a)}>Reach level {dv.level + 1}</button>
        </div>
      }>
      {!initialCls && <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => { setCls(null); setA({}); }}>Choose a different class</button>}
      <div className="sm mut" style={{ marginBottom: 10 }}>Character level {dv.level + 1} · proficiency bonus {sgn(plan.pb)}</div>
      {steps.map((s, si) => {
        const k = si;
        switch (s.kind) {
          case "prereq":
            return <div key={k} className={s.ok ? "good" : "warn"}>{s.ok ? `Meets multiclass requirements (${s.detail}).` : `Multiclassing needs ${s.detail} in both classes. You can still continue if your DM allows it.`}</div>;
          case "info":
            return <div key={k} className="step done"><h4>{s.label}</h4><div className="sm mut">{s.detail}</div></div>;
          case "hp":
            return (
              <div key={k} className="step done">
                <h4>Hit points <span className="badge gold">+{hpGain}</span></h4>
                {s.fixed ? <div className="sm mut">First level: {s.fixed} + Constitution.</div> : (
                  <div className="row wraprow">
                    <button className={"pill" + (a.hp == null ? " on" : "")} onClick={() => set("hp", null)}>Average ({s.average})</button>
                    <button className="pill" onClick={() => set("hp", d(s.die))}>Roll d{s.die}</button>
                    <input aria-label="Hit die result" type="number" inputMode="numeric" min="1" max={s.die} style={{ width: 70 }} value={a.hp ?? ""} placeholder={s.average}
                      onChange={(e) => set("hp", e.target.value === "" ? null : Math.max(1, Math.min(s.die, +e.target.value)))} />
                  </div>
                )}
              </div>
            );
          case "skills":
            return (
              <div key={k} className={"step" + ((a.skills || []).length >= s.n ? " done" : "")}>
                <h4>{s.label} <Count have={(a.skills || []).length} need={s.n} /></h4>
                <Chips max={s.n} value={a.skills || []} onChange={(v) => set("skills", v)} options={skillOpts(s.from)} />
              </div>
            );
          case "features":
            return (
              <div key={k} className="step done">
                <h4>New features{s.from ? ` from ${s.from}` : ""}</h4>
                {s.list.map((f) => <Feature key={f.name} name={f.name} desc={f.desc} />)}
              </div>
            );
          case "option": {
            const val = [].concat(a.options?.[s.key] || []);
            const already = new Set([].concat(c.choices?.[s.key] || []));
            return (
              <div key={k} className={"step" + (val.length >= s.n ? " done" : "")}>
                <h4>{s.label} <Count have={val.length} need={s.n} /></h4>
                <Chips max={s.n} value={val} onChange={(v) => setA((x) => ({ ...x, options: { ...(x.options || {}), [s.key]: v } }))}
                  options={s.options.filter((o) => !already.has(o.name)).map((o) => ({ value: o.name, label: o.name.replace(/^[^:]+: /, "") }))} />
                {val.map((name) => { const o = s.options.find((x) => x.name === name); return o ? <Feature key={name} name={name} desc={o.desc} /> : null; })}
              </div>
            );
          }
          case "expertise":
            return (
              <div key={k} className={"step" + ((a.expertise || []).length >= s.n ? " done" : "")}>
                <h4>{s.label} <Count have={(a.expertise || []).length} need={s.n} /></h4>
                <Chips max={s.n} value={a.expertise || []} onChange={(v) => set("expertise", v)} options={skillOpts(proficientAfter.filter((x) => !(c.expertise || []).includes(x)))} />
              </div>
            );
          case "subclass":
            return (
              <div key={k} className={"step" + (a.subclass ? " done" : "")}>
                <h4>{s.label}</h4>
                {bySource(s.options).map(([src, list]) => (
                  <div key={src}>
                    <div className="xs mut" style={{ margin: "6px 0 4px", fontWeight: 700 }}>{SRC_SHORT[src]}</div>
                    {list.map((o) => (
                      <div key={o.key} className={"opt" + (a.subclass === o.key ? " on" : "")}>
                        <button style={{ width: "100%", textAlign: "left" }} onClick={() => set("subclass", o.key)} aria-pressed={a.subclass === o.key}>
                          <strong>{o.name}</strong>
                        </button>
                        {a.subclass === o.key && (
                          <>
                            <Md text={o.desc} />
                            {o.features.filter((f) => f.level === plan.newLevel).map((f) => <Feature key={f.name} name={f.name} desc={f.desc} />)}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          case "asi":
            return (
              <div key={k} className={"step" + (a.asi ? " done" : "")}>
                <h4>{s.label}</h4>
                <AsiEditor dv={dv} value={a.asi} onChange={(v) => set("asi", v)} />
              </div>
            );
          case "cantrips":
          case "spells": {
            const isC = s.kind === "cantrips";
            const list = D.SPELLS.filter((sp) => sp.classes.includes(caster?.list || cls) && (isC ? sp.level === 0 : sp.level >= 1 && sp.level <= maxSlot) && !known.has(sp.name));
            return (
              <div key={k} className={"step" + ((a[s.kind] || []).length >= s.n ? " done" : "")}>
                <h4>{isC ? "New cantrips" : `New spells (up to ${ordinal(maxSlot)} level)`} <Count have={(a[s.kind] || []).length} need={s.n} /></h4>
                <SpellPicker list={list} n={s.n} value={a[s.kind] || []} onChange={(v) => set(s.kind, v)} />
              </div>
            );
          }
          default: return null;
        }
      })}
    </Modal>
  );
}

function SpellPicker({ list, n, value, onChange }) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const shown = list.filter((s) => (src === "all" || s.source === src) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  const sources = [...new Set(list.map((s) => s.source))];
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <input placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: "auto" }} value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="all">All books</option>
          {SRC_ORDER.filter((s) => sources.includes(s)).map((s) => <option key={s} value={s}>{SRC_SHORT[s]}</option>)}
        </select>
      </div>
      {value.length > 0 && <div className="chips" style={{ marginBottom: 6 }}>{value.map((v) => <button key={v} className="pill on" onClick={() => onChange(value.filter((x) => x !== v))}>{v} ×</button>)}</div>}
      <div className="spl">
        {shown.slice(0, 150).map((s) => {
          const on = value.includes(s.name);
          return (
            <Feature key={s.name} name={s.name} desc={`*${s.level ? ordinal(s.level) + "-level " : ""}${s.school}${s.level ? "" : " cantrip"}${s.ritual ? " (ritual)" : ""}* · ${s.time} · ${s.range} · ${s.comp}${s.conc ? " · concentration" : ""}\n\n${s.desc}${s.higher ? "\n\n**At higher levels.** " + s.higher : ""}`}
              right={<>
                {s.source !== "srd" ? <span className="badge">{SRC_SHORT[s.source]}</span> : null}
                <button className={"pill" + (on ? " on" : "")} disabled={!on && value.length >= n}
                  onClick={(e) => { e.preventDefault(); onChange(on ? value.filter((x) => x !== s.name) : [...value, s.name]); }}>{on ? "Chosen" : "Choose"}</button>
              </>} />
          );
        })}
        {!shown.length && <div className="empty">No spells match.</div>}
        {shown.length > 150 && <div className="empty">Showing 150 of {shown.length}. Search to narrow it down.</div>}
      </div>
    </div>
  );
}

// ================================================================ SHEET PREVIEW (read-only until the Play tab lands)
function Preview({ c, dv }) {
  const profDot = (p) => <span className={"dot" + (p >= 2 ? " p2" : p >= 1 ? " p1" : p > 0 ? " ph" : "")} />;
  return (
    <>
      <div className="grid g6" style={{ marginTop: 10 }}>
        <div className="stat"><div className="v">{dv.ac}</div><div className="l">Armor Class</div><div className="s">{dv.acBreakdown[0]}</div></div>
        <div className="stat"><div className="v">{dv.hpMax}</div><div className="l">Max HP</div><div className="s">{dv.hitDice.map((h) => `${h.total}d${h.die}`).join(" + ")}</div></div>
        <div className="stat"><div className="v">{sgn(dv.init)}</div><div className="l">Initiative</div></div>
        <div className="stat"><div className="v">{dv.speed}</div><div className="l">Speed</div><div className="s">feet</div></div>
        <div className="stat"><div className="v">{sgn(dv.pb)}</div><div className="l">Proficiency</div></div>
        <div className="stat"><div className="v">{dv.passive.perception}</div><div className="l">Passive Perception</div></div>
      </div>
      <div className="cols">
        <div>
          <div className="card">
            <h3>Abilities and saving throws</h3>
            <div className="grid g3">
              {ABIL.map((a) => (
                <div className="ab" key={a}>
                  <div className="lb">{ABILNAME[a]}</div>
                  <div className="sc">{sgn(dv.m[a])}</div>
                  <div className="xs mut">score {dv.ab[a]}</div>
                  <div className="sm" style={{ marginTop: 4 }}>{profDot(dv.saves[a].prof ? 1 : 0)} save {sgn(dv.saves[a].mod)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Attacks</h3>
            {dv.attacks.map((w) => (
              <div className="skrow" key={w.id}>
                <div><div style={{ fontWeight: 650 }}>{w.name}</div><div className="xs mut">{w.dice}{w.dmg ? sgn(w.dmg) : ""} {w.dmgType} · {w.range}{w.mastery ? ` · ${w.mastery}${w.masteryOn ? "" : " (not mastered)"}` : ""}{w.notes.length ? " · " + w.notes.join(", ") : ""}</div></div>
                <div className="mo">{sgn(w.atk)}</div>
              </div>
            ))}
            {dv.attackExtras.length > 0 && <div className="xs mut" style={{ marginTop: 6 }}>{dv.attackExtras.join(" · ")}</div>}
          </div>
          {dv.spell.casters.length > 0 && (
            <div className="card">
              <h3>Spellcasting</h3>
              {dv.spell.casters.map((k) => (
                <div className="skrow" key={k.cls}>
                  <div><div style={{ fontWeight: 650 }}>{k.name}</div><div className="xs mut">{ABILNAME[k.ability]}{k.cantrips != null ? ` · ${k.cantrips} cantrips` : ""}{k.known != null ? ` · ${k.known} known` : ""}{k.prepared != null ? ` · ${k.prepared} prepared` : ""}</div></div>
                  <div className="sm">DC <strong>{k.dc}</strong> · {sgn(k.atk)}</div>
                </div>
              ))}
              <div className="sm" style={{ marginTop: 6 }}>
                {dv.spell.slotState.length ? "Slots: " + dv.spell.slotState.map((s) => `${ordinal(s.level)} ×${s.max}`).join(", ") : ""}
                {dv.spell.pact ? `${dv.spell.slotState.length ? " · " : ""}Pact slots: ${dv.spell.pact.count} × ${ordinal(dv.spell.pact.level)}` : ""}
              </div>
            </div>
          )}
          {dv.resources.length > 0 && (
            <div className="card">
              <h3>Class resources</h3>
              {dv.resources.map((r) => (
                <div className="skrow" key={r.key}><span>{r.name}{r.note ? <span className="xs mut"> · {r.note}</span> : null}</span><span className="sm">{r.max} per {r.reset} rest</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Skills</h3>
          {Object.entries(dv.skills).map(([k, s]) => (
            <div className="skrow" key={k}>
              <span className="row" style={{ gap: 8 }}>{profDot(s.prof || (s.why ? 0.5 : 0))}<span>{s.name} <span className="xs mut">{s.abil}</span></span>{s.dis.length ? <span className="badge" title={s.dis.join(", ")}>disadv.</span> : null}</span>
              <span className="mo">{sgn(s.mod)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="empty">This is a read-only preview. The full Play tab with rolling, HP, slots, and rests comes next.</div>
    </>
  );
}

// ================================================================ NOTES
function ImportBox({ onImport }) {
  const [txt, setTxt] = useState(""); const [err, setErr] = useState("");
  return (
    <details className="ft" style={{ marginTop: 16 }}>
      <summary><span className="ttl sm">Import characters from a backup</span></summary>
      <textarea rows={4} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Paste exported JSON" style={{ marginTop: 8 }} />
      {err && <div className="warn">{err}</div>}
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => {
        try {
          const v = JSON.parse(txt); const arr = Array.isArray(v) ? v : v.chars || [v];
          if (!arr.length || !arr[0].classes) throw new Error();
          onImport(arr.map((x) => ({ ...E.newChar(), ...x })));
        } catch { setErr("That isn't a character export from this app. Paste the full text from Export."); }
      }}>Import</button>
    </details>
  );
}

function Notes({ c, dv, setChar, chars, setChars, setActiveId, setToast, lib, libApi }) {
  const [showExport, setShowExport] = useState(false);
  const json = JSON.stringify(chars, null, 1);
  return (
    <>
      <MissingCard c={c} dv={dv} D={D} setChar={setChar} libApi={libApi} setToast={setToast} />
      <div className="card">
        <h3 data-icon="scroll">Notes</h3>
        <textarea rows={12} value={c.notes} onChange={(e) => setChar(() => ({ notes: e.target.value }))} placeholder="Backstory, allies, loot, what the DM said last session…" />
      </div>
      <div className="card">
        <h3>Import from D&amp;D Beyond</h3>
        <ImportPdf onAdd={(ch) => { setChars((cs) => [...cs, ch]); setActiveId(ch.id); setToast(`Imported ${ch.name}`); }} />
      </div>
      <LibraryCard lib={lib} libApi={libApi} system={c.system || "2024"} setToast={setToast} />
      <div className="card">
        <h3 data-icon="box">Backup</h3>
        <div className="row wraprow">
          <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(json); setToast("Copied all characters"); } catch { setShowExport(true); } }}>Copy all characters</button>
          <button className="btn" onClick={() => setShowExport((s) => !s)}>{showExport ? "Hide export" : "Show export text"}</button>
        </div>
        {showExport && <textarea readOnly rows={6} value={json} style={{ marginTop: 8 }} onFocus={(e) => e.target.select()} />}
        <ImportBox onImport={(arr) => { setChars((cs) => [...cs, ...arr.map((x) => ({ ...x, id: "c" + E.uid() }))]); setToast(`Imported ${arr.length}`); }} />
      </div>
      <div className="card">
        <h3>Delete</h3>
        <button className="btn dan" onClick={() => {
          if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
          const rest = chars.filter((y) => y.id !== c.id);
          setChars(rest); setActiveId(rest[0]?.id || null);
        }}>Delete {c.name}</button>
      </div>
    </>
  );
}
