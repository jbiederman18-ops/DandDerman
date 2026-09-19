import React, { useState } from "react";
import * as H from "./homebrew.js";

// ================================================================ homebrew library UI
const ord = (n) => (n === 0 ? "Cantrip" : n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"));
const KIND_LABEL = Object.fromEntries(H.KINDS);
KIND_LABEL.species = "Species"; KIND_LABEL.background = "Background"; KIND_LABEL.subclass = "Subclass";
const CLASS_KEYS = ["artificer", "bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Lbl({ children }) {
  return <div className="xs mut" style={{ marginBottom: 3, fontWeight: 600 }}>{children}</div>;
}

// "Look it up" goes to the entry's own page; "Search" is there for the pages that don't follow
// the wiki's naming, and for kinds with no page of their own.
export function WikiLinks({ kind, name, system, cls, compact }) {
  if (!name) return null;
  const url = H.wikiUrl(kind, name, system, { cls });
  const search = H.wikiSearch(name, system);
  const style = { fontSize: 12.5, fontWeight: 600, color: "var(--brass)", textDecoration: "none", whiteSpace: "nowrap" };
  return (
    <span className="row" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" style={style}>{compact ? "Wiki ↗" : "Look it up ↗"}</a>}
      <a href={search} target="_blank" rel="noopener noreferrer" style={{ ...style, color: url ? "var(--mut)" : "var(--brass)" }}>Search{url ? "" : " the wiki ↗"}</a>
    </span>
  );
}

// ---------------------------------------------------------------- editor
const BLANK = {
  spell: { name: "", level: 1, school: "", time: "Action", range: "", comp: "V, S", mat: "", dur: "Instantaneous", conc: false, ritual: false, classes: [], desc: "", higher: "", source: "" },
  feat: { name: "", cat: "general", prereq: "", desc: "", source: "" },
  feature: { name: "", source: "", desc: "" },
  item: { name: "", type: "Wondrous Item", rarity: "uncommon", attune: false, desc: "", source: "" },
};

export function HomebrewEditor({ initial, system, onSave, onCancel, lockKind }) {
  const [kind, setKind] = useState(initial?.kind || "spell");
  const [f, setF] = useState({ ...BLANK[initial?.kind || "spell"], ...(initial || {}) });
  const [sys, setSys] = useState(initial?.system || system || "2024");
  const [paste, setPaste] = useState("");
  const [filled, setFilled] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const switchKind = (k) => { setKind(k); setF({ ...BLANK[k], name: f.name, desc: f.desc, source: f.source }); setFilled(""); };

  const onPaste = (text) => {
    setPaste(text);
    if (text.trim().length < 20) return;
    const got = H.parseWikiPaste(text, kind);
    const keep = Object.fromEntries(Object.entries(got).filter(([k, v]) => v !== undefined && v !== "" && !(k === "name" && f.name)));
    setF((prev) => ({ ...prev, ...keep }));
    const n = Object.keys(keep).length;
    setFilled(n ? `Filled in ${n} ${n === 1 ? "field" : "fields"} from the paste. Check them below.` : "Couldn't find any fields in that. Paste the whole page, from the title down.");
  };

  const ok = f.name.trim() && (kind !== "spell" || f.level !== "");
  return (
    <div style={{ border: "var(--bd) solid var(--line)", borderRadius: "var(--radsm)", padding: 10, marginTop: 8 }}>
      {!lockKind && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {H.KINDS.map(([k, l]) => <button key={k} className={"pill" + (kind === k ? " on" : "")} onClick={() => switchKind(k)}>{l}</button>)}
        </div>
      )}
      <Lbl>Name</Lbl>
      <input value={f.name} onChange={set("name")} placeholder={kind === "spell" ? "Zephyr Strike" : kind === "feat" ? "Strixhaven Initiate" : kind === "item" ? "Cloak of Displacement" : "Combat Superiority"} />
      {f.name.trim() && (
        <div style={{ margin: "6px 0 2px" }}>
          <WikiLinks kind={kind} name={f.name} system={sys} />
          <div className="xs mut" style={{ marginTop: 3 }}>Open the page, select everything from the title to the end of the text, copy, and paste it here.</div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <Lbl>Paste the page here</Lbl>
        <textarea rows={3} value={paste} onChange={(e) => onPaste(e.target.value)} placeholder="Paste the copied wiki page and the fields fill themselves in." />
        {filled && <div className="xs" style={{ marginTop: 4, color: "var(--verd)" }}>{filled}</div>}
      </div>

      {kind === "spell" && (
        <>
          <div className="grid g2" style={{ marginTop: 8 }}>
            <label><Lbl>Level</Lbl>
              <select value={f.level} onChange={(e) => setF({ ...f, level: +e.target.value })}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((L) => <option key={L} value={L}>{ord(L)}</option>)}
              </select>
            </label>
            <label><Lbl>School</Lbl><input value={f.school} onChange={set("school")} placeholder="evocation" /></label>
            <label><Lbl>Casting time</Lbl><input value={f.time} onChange={set("time")} /></label>
            <label><Lbl>Range</Lbl><input value={f.range} onChange={set("range")} /></label>
            <label><Lbl>Components</Lbl><input value={f.comp} onChange={set("comp")} /></label>
            <label><Lbl>Duration</Lbl><input value={f.dur} onChange={set("dur")} /></label>
          </div>
          <div className="row wraprow" style={{ margin: "8px 0" }}>
            <button className={"pill" + (f.conc ? " on" : "")} onClick={() => setF({ ...f, conc: !f.conc })}>Concentration</button>
            <button className={"pill" + (f.ritual ? " on" : "")} onClick={() => setF({ ...f, ritual: !f.ritual })}>Ritual</button>
          </div>
          <Lbl>Class spell lists</Lbl>
          <div className="chips" style={{ marginBottom: 8 }}>
            {CLASS_KEYS.map((k) => {
              const on = (f.classes || []).includes(k);
              return <button key={k} className={"pill" + (on ? " on" : "")} onClick={() => setF({ ...f, classes: on ? f.classes.filter((x) => x !== k) : [...(f.classes || []), k] })}>{cap(k)}</button>;
            })}
          </div>
        </>
      )}
      {kind === "feat" && (
        <div className="grid g2" style={{ marginTop: 8 }}>
          <label><Lbl>Kind of feat</Lbl>
            <select value={f.cat} onChange={set("cat")}>
              <option value="origin">Origin</option><option value="general">General</option>
              <option value="fighting-style">Fighting style</option><option value="epic">Epic boon</option><option value="other">Other</option>
            </select>
          </label>
          <label><Lbl>Prerequisite</Lbl><input value={f.prereq} onChange={set("prereq")} placeholder="Level 4+" /></label>
        </div>
      )}
      {kind === "item" && (
        <>
          <div className="grid g2" style={{ marginTop: 8 }}>
            <label><Lbl>Type</Lbl><input value={f.type} onChange={set("type")} /></label>
            <label><Lbl>Rarity</Lbl>
              <select value={f.rarity} onChange={set("rarity")}>
                {["common", "uncommon", "rare", "very rare", "legendary", "artifact", "varies"].map((r) => <option key={r} value={r}>{cap(r)}</option>)}
              </select>
            </label>
          </div>
          <div className="row wraprow" style={{ margin: "8px 0" }}>
            <button className={"pill" + (f.attune ? " on" : "")} onClick={() => setF({ ...f, attune: !f.attune })}>Requires attunement</button>
          </div>
        </>
      )}
      <div style={{ marginTop: 8 }}>
        <Lbl>{kind === "feature" ? "What it does" : "Text"}</Lbl>
        <textarea rows={5} value={f.desc} onChange={set("desc")} />
      </div>
      {kind === "spell" && (
        <div style={{ marginTop: 6 }}><Lbl>At higher levels (optional)</Lbl><textarea rows={2} value={f.higher} onChange={set("higher")} /></div>
      )}
      <div className="grid g2" style={{ marginTop: 8 }}>
        <label><Lbl>{kind === "feature" ? "From (class, subclass, species)" : "Book"}</Lbl><input value={f.source} onChange={set("source")} placeholder={kind === "feature" ? "Battle Master" : "Player's Handbook"} /></label>
        <label><Lbl>Rules</Lbl>
          <select value={sys} onChange={(e) => setSys(e.target.value)}>
            <option value="2024">2024 rules</option><option value="2014">2014 rules</option><option value="both">Both</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn pri" disabled={!ok} onClick={() => onSave({ ...f, kind, system: sys, name: f.name.trim() })}>Save to library</button>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- missing entries
export function MissingCard({ c, dv, D, setChar, libApi, setToast }) {
  const [open, setOpen] = useState(null);
  const list = H.missingEntries(c, dv, D);
  if (!list.length) return null;
  const system = c.system || "2024";
  return (
    <div className="card" data-card="missing">
      <h3 data-icon="book">Missing from the books</h3>
      <div className="xs mut" style={{ marginBottom: 8 }}>
        These have a name on {c.name}'s sheet but no rules text. Look each one up, then fill it in once: the text goes to your
        library and every character with it picks it up.
      </div>
      {list.map((m) => {
        const key = m.kind + ":" + m.name;
        return (
          <div key={key} style={{ borderBottom: "var(--bd) solid var(--line2)", padding: "8px 0" }}>
            <div className="between" style={{ gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>{m.name}</div>
                <div className="xs mut">
                  {KIND_LABEL[m.kind]}{m.kind === "spell" && m.level != null ? ` · ${ord(m.level)}` : ""}
                  {m.source ? ` · ${m.source}${m.page ? " p. " + m.page : ""}` : ""}
                </div>
              </div>
              <WikiLinks kind={m.kind} name={m.name} system={system} cls={m.cls} compact />
            </div>
            <div className="row wraprow" style={{ marginTop: 6 }}>
              {!m.linkOnly && <button className="btn sm pri" onClick={() => setOpen(open === key ? null : key)}>{open === key ? "Close" : "Fill in"}</button>}
              <button className="btn sm" onClick={() => setChar((x) => ({ hbDismissed: [...(x.hbDismissed || []), key] }))}>Not needed</button>
            </div>
            {open === key && (
              <HomebrewEditor lockKind system={system}
                initial={{ kind: m.kind, name: m.name, ...(m.kind === "spell" ? { level: m.level ?? 1 } : {}), source: m.kind === "feature" ? m.source || "" : "", system }}
                onCancel={() => setOpen(null)}
                onSave={(e) => { libApi.save(e); setOpen(null); setToast(`${e.name} is in your library`); }} />
            )}
          </div>
        );
      })}
      {(c.hbDismissed || []).length > 0 && (
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setChar(() => ({ hbDismissed: [] }))}>Show {c.hbDismissed.length} hidden</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the library itself
export function LibraryCard({ lib, libApi, system, setToast }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const shown = lib.filter((e) => filter === "all" || e.kind === filter).sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries(H.KINDS.map(([k]) => [k, lib.filter((e) => e.kind === k).length]));
  return (
    <div className="card" data-card="library">
      <div className="between" style={{ marginBottom: 6 }}>
        <h3 data-icon="gem" style={{ margin: 0 }}>Homebrew library</h3>
        <span className="xs mut">{lib.length} {lib.length === 1 ? "entry" : "entries"} · every character</span>
      </div>
      <div className="xs mut" style={{ marginBottom: 8 }}>
        Spells, feats, features, and magic items from books that aren't bundled, or your own inventions. Spells show up in
        the Spells tab's picker, feats in feat choices, and items in the Gear search.
      </div>
      {lib.length > 0 && (
        <div className="chips" style={{ marginBottom: 6 }}>
          <button className={"pill" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>All</button>
          {H.KINDS.filter(([k]) => counts[k]).map(([k, l]) => (
            <button key={k} className={"pill" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>{l.replace("Class or species feature", "Feature")} · {counts[k]}</button>
          ))}
        </div>
      )}
      {shown.map((e) => (
        <details key={e.id} className="ft">
          <summary>
            <span className="ttl">{e.name}</span>
            <span className="row" style={{ gap: 6, marginLeft: "auto" }}>
              <span className="badge">{e.kind === "spell" ? ord(+e.level || 0) : KIND_LABEL[e.kind].replace("Class or species feature", "Feature")}</span>
              <span className="badge">{e.system === "both" ? "both" : e.system}</span>
            </span>
          </summary>
          <div style={{ padding: "6px 0 4px" }}>
            {e.desc ? <div className="md sm" style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{e.desc}</div> : <div className="note">No text yet.</div>}
            <div className="row wraprow" style={{ marginTop: 8 }}>
              <WikiLinks kind={e.kind} name={e.name} system={e.system === "2014" ? "2014" : "2024"} compact />
              <span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => setEditing(editing === e.id ? null : e.id)}>{editing === e.id ? "Close" : "Edit"}</button>
              <button className="btn sm dan" onClick={() => { if (confirm(`Remove ${e.name} from the library? Characters keep the name but lose the text.`)) { libApi.remove(e.id); setToast(`Removed ${e.name}`); } }}>Remove</button>
            </div>
            {editing === e.id && (
              <HomebrewEditor lockKind initial={e} system={system} onCancel={() => setEditing(null)}
                onSave={(n) => { libApi.save({ ...e, ...n }); setEditing(null); setToast(`Saved ${n.name}`); }} />
            )}
          </div>
        </details>
      ))}
      <details style={{ marginTop: 10 }}>
        <summary className="xs mut" style={{ cursor: "pointer" }}>Wiki links go to {H.WIKI["2024"].label} (2024) and {H.WIKI["2014"].label} (2014)</summary>
        <div className="grid g2" style={{ marginTop: 6 }}>
          {["2024", "2014"].map((k) => (
            <label key={k}><Lbl>{k} rules</Lbl>
              <input defaultValue={H.WIKI[k].label} onBlur={(e) => { H.setWikiBase(k, e.target.value); libApi.saveWiki?.(); setToast(`${k} links now go to ${H.WIKI[k].label}`); }} />
            </label>
          ))}
        </div>
      </details>
      {!adding ? (
        <button className="btn pri" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>Add homebrew</button>
      ) : (
        <HomebrewEditor system={system} onCancel={() => setAdding(false)}
          onSave={(e) => { libApi.save(e); setAdding(false); setToast(`${e.name} is in your library`); }} />
      )}
    </div>
  );
}
