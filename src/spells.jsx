import React, { useState } from "react";
import * as E from "./dnd5e-engine.js";
import { rollCheck, rollExpr } from "./play.jsx";
import { WikiLinks, HomebrewEditor } from "./library.jsx";

// ================================================================ Spells tab
// Casting stats, slots, the character's spells grouped by level with casting, rolls, and
// preparation, and a picker for adding spells from the class list, any list, or your own.

const sgn = E.sgn;
const ord = (n) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
const ABN = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const levelName = (l) => (l === 0 ? "Cantrips" : ord(l) + " level");

function Lbl({ children }) {
  return <div className="xs mut" style={{ marginBottom: 3, fontWeight: 600 }}>{children}</div>;
}

function Pips({ max, used, onSet, color = "var(--vio)", label }) {
  return (
    <div className="chips">
      {Array.from({ length: max }).map((_, i) => (
        <button key={i} aria-label={`${label} ${i + 1}${i < used ? " (spent)" : ""}`} onClick={() => onSet(i < used ? i : i + 1)}
          style={{ width: 22, height: 22, borderRadius: 6, border: "var(--bd) solid var(--line)", background: i < used ? color : "var(--pan2)" }} />
      ))}
    </div>
  );
}

export function Spells({ c, dv, D, setChar, roll, setToast, libApi }) {
  const [view, setView] = useState("ready");
  const S = dv.spell;
  const casters = S.casters;

  // The character's spells plus subclass spells that are always prepared.
  const lookup = (name) => D.SPELLS.find((x) => x.name === name) || (c.customSpells || []).find((x) => x.name === name);
  const listed = new Set(S.spells.map((s) => s.name));
  const always = S.alwaysPrepared.filter((a) => !listed.has(a.name)).map((a) => {
    const data = lookup(a.name);
    return { name: a.name, cls: a.cls, always: true, from: a.from, data, level: data?.level ?? 0, fixed: true };
  });
  const all = [...S.spells, ...always];
  const casterOf = (s) => casters.find((k) => k.cls === s.cls) || casters[0] || null;
  const isReady = (s) => {
    if (s.level === 0 || s.always) return true;
    const k = casterOf(s);
    return !k || k.prepared == null || !!s.prepared;
  };
  const shown = view === "ready" ? all.filter(isReady) : all;
  const levels = [...new Set(shown.map((s) => s.level))].sort((a, b) => a - b);

  return (
    <>
      {casters.length > 0 ? <CastingCard c={c} dv={dv} setChar={setChar} roll={roll} /> : (
        <div className="card">
          <h3 data-icon="star">Spellcasting</h3>
          <div className="mut sm">No spellcasting class yet. Spells from a feat, a species, or an item can still go here: add them below.</div>
        </div>
      )}
      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <h3 data-icon="book" style={{ margin: 0 }}>Your spells</h3>
          <div className="chips">
            {[["ready", "Ready to cast"], ["all", "Everything"]].map(([k, l]) => (
              <button key={k} className={"pill" + (view === k ? " on" : "")} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
        </div>
        {!all.length && <div className="mut sm">No spells yet. Add some below, or pick them when you level up.</div>}
        {all.length > 0 && !shown.length && <div className="mut sm">Nothing prepared. Switch to Everything and prepare a few.</div>}
        {levels.map((L) => (
          <div key={L} style={{ marginTop: 8 }}>
            <div className="xs mut" style={{ fontWeight: 700, margin: "4px 0 2px" }}>{levelName(L)}</div>
            {shown.filter((s) => s.level === L).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <SpellRow key={s.cls + ":" + s.name} s={s} c={c} dv={dv} caster={casterOf(s)} setChar={setChar} roll={roll} setToast={setToast} libApi={libApi} />
            ))}
          </div>
        ))}
      </div>
      <AddSpells c={c} dv={dv} D={D} setChar={setChar} setToast={setToast} libApi={libApi} />
    </>
  );
}

// ---------------------------------------------------------------- casting stats and slots
function CastingCard({ c, dv, setChar, roll }) {
  const S = dv.spell;
  const pact = S.pact;
  return (
    <div className="card">
      <h3 data-icon="star">Spellcasting</h3>
      {S.casters.map((k) => {
        const counts = [
          k.cantrips != null && `${k.cantripsChosen}/${k.cantrips} cantrips`,
          k.known != null && `${k.leveledChosen}/${k.known} known`,
          k.prepared != null && `${k.preparedCount}/${k.prepared} prepared`,
        ].filter(Boolean);
        return (
          <div key={k.cls} className="skrow">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650 }}>{k.name}</div>
              <div className="xs mut">{ABN[k.ability]}{counts.length ? " · " + counts.join(" · ") : ""}</div>
            </div>
            <div className="row">
              <span className="sm">DC <strong>{k.dc}</strong></span>
              <button className="mapb" onClick={() => roll(rollCheck(k.name + " spell attack", k.atk))}>{sgn(k.atk)}<small>attack</small></button>
            </div>
          </div>
        );
      })}
      {S.slotState.map((s) => (
        <div key={s.level} className="skrow">
          <span className="sm">{ord(s.level)} level</span>
          <div className="row">
            <Pips max={s.max} used={s.used} label={ord(s.level) + " slot"} onSet={(n) => setChar((x) => ({ slotsUsed: { ...(x.slotsUsed || {}), [s.level]: n } }))} />
            <span className="xs mut" style={{ minWidth: 40, textAlign: "right" }}>{s.max - s.used} left</span>
          </div>
        </div>
      ))}
      {pact && (
        <div className="skrow">
          <span className="sm">Pact slots · {ord(pact.level)}</span>
          <div className="row">
            <Pips max={pact.count} used={+c.pactUsed || 0} color="var(--brass)" label="Pact slot" onSet={(n) => setChar(() => ({ pactUsed: n }))} />
            <span className="xs mut" style={{ minWidth: 40, textAlign: "right" }}>short rest</span>
          </div>
        </div>
      )}
      {(pact?.arcanum || []).length > 0 && (
        <div className="skrow">
          <span className="sm">Mystic Arcanum</span>
          <div className="chips">
            {pact.arcanum.map((L) => {
              const spent = !!(c.arcanumUsed || {})[L];
              return (
                <button key={L} className={"pill" + (spent ? "" : " on")} onClick={() => setChar((x) => ({ arcanumUsed: { ...(x.arcanumUsed || {}), [L]: spent ? 0 : 1 } }))}>
                  {ord(L)}{spent ? " · used" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {c.concentration && (
        <div className="note" style={{ marginTop: 8, marginBottom: 0 }}>
          Concentrating on <strong>{c.concentration}</strong>.
          <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setChar(() => ({ concentration: null }))}>Drop it</button>
        </div>
      )}
      {dv.rollMods?.notes?.some((n) => /can't cast spells/.test(n)) && (
        <div className="warn" style={{ marginTop: 8, marginBottom: 0 }}>You're wearing armor you aren't proficient with, so you can't cast spells.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one spell
function SpellRow({ s, c, dv, caster, setChar, roll, setToast, libApi }) {
  const d = s.data || {};
  const opts = E.castOptions(c, dv, s);
  const [pick, setPick] = useState(0);
  const [editing, setEditing] = useState(false);
  const opt = opts[Math.min(pick, opts.length - 1)];
  const castLevel = opt?.level || s.level;
  const dice = E.spellDice(s, castLevel, dv.level);
  const check = E.spellCheck(s);
  const prepToggle = caster && caster.prepared != null && s.level > 0 && !s.always;
  const heals = /regains? (a number of )?hit points/i.test(d.desc || "");
  const setSpell = (patch) => setChar((x) => ({ spells: (x.spells || []).map((y) => (y.name === s.name && y.cls === s.cls ? { ...y, ...patch } : y)) }));

  const cast = () => {
    if (!opt) return;
    const r = E.castSpell(c, dv, s, opt);
    if (r.events[0]?.type === "unavailable") { setToast("No way to cast that right now"); return; }
    setChar(() => r.patch);
    const dropped = r.events.find((e) => e.type === "dropped");
    const how = opt.kind === "free" ? "" : opt.kind === "ritual" ? " as a ritual" : opt.kind === "pact" ? " with a pact slot" : opt.kind === "arcanum" ? " (Mystic Arcanum)" : ` at ${ord(opt.level)} level`;
    setToast(`Cast ${s.name}${how}` + (dropped ? ` · dropped ${dropped.spell}` : ""));
  };

  return (
    <details className="ft">
      <summary>
        <span className="ttl">{s.name}</span>
        <span className="row" style={{ gap: 5, marginLeft: "auto" }}>
          {d.conc && <span className="badge" title="Concentration">C</span>}
          {d.ritual && <span className="badge" title="Ritual">R</span>}
          {s.always && <span className="badge gold" title={s.from || "Always prepared"}>always</span>}
          {prepToggle && (
            <button className={"pill" + (s.prepared ? " on" : "")} style={{ padding: "2px 9px", fontSize: 12 }}
              onClick={(e) => { e.preventDefault(); setSpell({ prepared: !s.prepared }); }}>
              {s.prepared ? "Prepared" : "Prepare"}
            </button>
          )}
        </span>
      </summary>
      <div style={{ padding: "6px 0 4px" }}>
        <div className="xs mut" style={{ marginBottom: 6 }}>
          {[s.level ? `${ord(s.level)}-level ${d.school || ""}`.trim() : `${d.school || ""} cantrip`.trim(), d.time, d.range, d.comp, d.dur, d.conc && !/concentration/i.test(d.dur || "") && "concentration"].filter(Boolean).join(" · ")}
          {d.mat ? ` (${d.mat})` : ""}
          {caster ? ` · ${caster.name}` : ""}
        </div>
        {d.desc ? <div className="md sm" style={{ whiteSpace: "pre-wrap" }}>{d.desc}</div> : (
          <div className="note">
            {d.source ? `From ${d.source}${d.page ? ", page " + d.page : ""}. ` : ""}No text here yet. Look it up and fill it in once: every
            character with this spell gets it, and the sheet can read its dice and saving throw.
            <div className="row wraprow" style={{ marginTop: 6 }}>
              <WikiLinks kind="spell" name={s.name} system={c.system} />
              <button className="btn sm pri" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Fill in"}</button>
            </div>
          </div>
        )}
        {d.desc && <div style={{ marginTop: 6 }}><WikiLinks kind="spell" name={s.name} system={c.system} compact /></div>}
        {d.higher && <div className="md sm" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}><strong>At higher levels.</strong> {d.higher}</div>}

        {opts.length > 0 ? (
          <div className="row wraprow" style={{ marginTop: 10 }}>
            {opts.length > 1 && (
              <select value={Math.min(pick, opts.length - 1)} onChange={(e) => setPick(+e.target.value)} style={{ flex: 1, minWidth: 170 }}>
                {opts.map((o, i) => <option key={i} value={i}>{o.label}{o.left != null ? ` · ${o.left} left` : ""}</option>)}
              </select>
            )}
            <button className="btn pri sm" onClick={cast}>{opts.length === 1 && opt.kind !== "free" ? `Cast · ${opt.label}` : "Cast"}</button>
          </div>
        ) : (
          <div className="xs mut" style={{ marginTop: 10 }}>No slot left that can cast this. A long rest brings them back.</div>
        )}
        <div className="row wraprow" style={{ marginTop: 8 }}>
          {check?.kind === "attack" && caster && (
            <button className="btn sm" onClick={() => roll(rollCheck(s.name + " — spell attack", caster.atk))}>Attack {sgn(caster.atk)}</button>
          )}
          {check?.kind === "save" && caster && (
            <span className="badge">DC {caster.dc} {check.ability ? ABN[check.ability] : check.text} save</span>
          )}
          {dice && (
            <button className="btn sm" onClick={() => roll(rollExpr(dice, `${s.name} ${heals ? "healing" : "damage"}${castLevel > s.level ? ` (${ord(castLevel)} level)` : ""}`))}>
              {heals ? "Heal" : "Roll"} {dice}{heals && caster ? " + " + ABN[caster.ability].slice(0, 3) : ""}
            </button>
          )}
        </div>
        {heals && caster && dice && <div className="xs mut" style={{ marginTop: 4 }}>Add your {ABN[caster.ability]} modifier if the spell says to.</div>}

        <div className="row wraprow" style={{ marginTop: 10 }}>
          {(d.custom || d.homebrew) && d.desc && <button className="btn sm" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit text"}</button>}
          {!s.fixed && (
            <button className="btn sm dan" onClick={() => setChar((x) => ({
              spells: (x.spells || []).filter((y) => !(y.name === s.name && y.cls === s.cls)),
              concentration: x.concentration === s.name ? null : x.concentration,
            }))}>Remove</button>
          )}
          {s.fixed && <span className="xs mut">From {s.from}; always prepared.</span>}
        </div>
        {editing && libApi && (
          <HomebrewEditor lockKind system={c.system}
            initial={{ ...(d.homebrew ? libEntry(d) : {}), kind: "spell", name: s.name, level: s.level, school: d.school || "", time: d.time || "", range: d.range || "",
              comp: d.comp || "", dur: d.dur || "", conc: !!d.conc, ritual: !!d.ritual, classes: d.classes || [], desc: d.desc || "", higher: d.higher || "",
              source: d.source || "", system: c.system, ...(d.libId ? { id: d.libId } : {}) }}
            onCancel={() => setEditing(false)}
            onSave={(e) => { libApi.save(e); setEditing(false); setToast(`${e.name} is in your library`); }} />
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- adding spells
function AddSpells({ c, dv, D, setChar, setToast, libApi }) {
  const casters = dv.spell.casters;
  const [cls, setCls] = useState(casters[0]?.cls || "");
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState("all");
  const [anyList, setAnyList] = useState(!casters.length);
  const [mode, setMode] = useState("list");
  const k = casters.find((x) => x.cls === cls) || null;
  const mine = new Set((c.spells || []).filter((s) => s.cls === (k?.cls || "")).map((s) => s.name));
  const maxL = anyList || !k ? 9 : k.maxLevel;
  const pool = D.SPELLS.filter((s) => (anyList || !k || s.classes.includes(k.list)) && s.level <= maxL && !mine.has(s.name));
  const needle = q.trim().toLowerCase();
  const hits = pool.filter((s) => (lvl === "all" || s.level === +lvl) && (!needle || s.name.toLowerCase().includes(needle)));
  const levelsHere = [...new Set(pool.map((s) => s.level))].sort((a, b) => a - b);

  const add = (sp, extra = {}) => {
    const leveled = sp.level > 0;
    const full = k && k.prepared != null && leveled && k.preparedCount >= k.prepared;
    setChar((x) => ({ spells: [...(x.spells || []), { name: sp.name, cls: k?.cls || "", prepared: !full, ...extra }] }));
    setToast(`Added ${sp.name}` + (full ? " (not prepared — you're at your limit)" : ""));
  };

  return (
    <div className="card" data-card="addspells">
      <h3 data-icon="scroll">Add spells</h3>
      <div className="chips" style={{ marginBottom: 8 }}>
        {[["list", "From the books"], ["own", "Your own"]].map(([m, l]) => (
          <button key={m} className={"pill" + (mode === m ? " on" : "")} onClick={() => setMode(m)}>{l}</button>
        ))}
      </div>
      {casters.length > 1 && (
        <div style={{ marginBottom: 8 }}>
          <Lbl>For</Lbl>
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            {casters.map((x) => <option key={x.cls} value={x.cls}>{x.name}</option>)}
          </select>
        </div>
      )}
      {mode === "own" ? (
        <>
          <div className="xs mut">Goes into your homebrew library, so any character can pick it later, then onto {c.name}'s list.</div>
          <HomebrewEditor lockKind system={c.system} initial={{ kind: "spell", level: 1, classes: k ? [k.list] : [], system: c.system }}
            onSave={(sp) => {
              if (D.SPELLS.some((x) => x.name.toLowerCase() === sp.name.toLowerCase())) { setToast("There's already a spell by that name"); return; }
              libApi.save(sp); add(sp);
            }} />
        </>
      ) : (
        <>
          <input placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips" style={{ margin: "8px 0" }}>
            <button className={"pill" + (lvl === "all" ? " on" : "")} onClick={() => setLvl("all")}>All</button>
            {levelsHere.map((L) => (
              <button key={L} className={"pill" + (lvl === String(L) ? " on" : "")} onClick={() => setLvl(String(L))}>{L === 0 ? "Cantrip" : ord(L)}</button>
            ))}
          </div>
          {k && (
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <button className={"pill" + (anyList ? " on" : "")} onClick={() => setAnyList((v) => !v)}>Any class's list</button>
              <span className="xs mut">{anyList ? "Showing every spell, for feats and items that grant one." : `${k.name} list, up to ${ord(Math.max(1, k.maxLevel))} level.`}</span>
            </div>
          )}
          <div className="spl">
            {hits.slice(0, 60).map((sp) => (
              <div key={sp.name} className="skrow">
                <div style={{ minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 600 }}>{sp.name}</div>
                  <div className="xs mut">
                    {[sp.level ? ord(sp.level) : "Cantrip", sp.school, sp.time, sp.conc && "concentration", sp.ritual && "ritual"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button className="btn sm" onClick={() => { add(sp); setQ(""); }}>Add</button>
              </div>
            ))}
            {!hits.length && <div className="empty">No spells match.</div>}
            {hits.length > 60 && <div className="xs mut">Showing 60 of {hits.length}. Search or pick a level to narrow it.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// Kept for reference; spells you write now go to the homebrew library.
function CustomSpellForm({ initial, onSave, keepName }) {
  const blank = { name: "", level: 1, school: "", time: "1 action", range: "", comp: "V, S", dur: "Instantaneous", conc: false, ritual: false, desc: "", higher: "", source: "", page: "" };
  const [f, setF] = useState({ ...blank, ...(initial || {}) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div style={{ marginTop: keepName ? 10 : 0 }}>
      {!keepName && <><Lbl>Name</Lbl><input value={f.name} placeholder="Tasha's Mind Whip" onChange={set("name")} /></>}
      <div className="grid g2" style={{ marginTop: 8 }}>
        <label><Lbl>Level</Lbl>
          <select value={f.level} onChange={(e) => setF({ ...f, level: +e.target.value })}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((L) => <option key={L} value={L}>{L === 0 ? "Cantrip" : ord(L)}</option>)}
          </select>
        </label>
        <label><Lbl>School</Lbl><input value={f.school} placeholder="enchantment" onChange={set("school")} /></label>
        <label><Lbl>Casting time</Lbl><input value={f.time} onChange={set("time")} /></label>
        <label><Lbl>Range</Lbl><input value={f.range} placeholder="90 feet" onChange={set("range")} /></label>
        <label><Lbl>Components</Lbl><input value={f.comp} onChange={set("comp")} /></label>
        <label><Lbl>Duration</Lbl><input value={f.dur} onChange={set("dur")} /></label>
        <label><Lbl>Book</Lbl><input value={f.source} placeholder="Player's Handbook" onChange={set("source")} /></label>
        <label><Lbl>Page</Lbl><input value={f.page} onChange={set("page")} /></label>
      </div>
      <div className="row wraprow" style={{ margin: "8px 0" }}>
        <button className={"pill" + (f.conc ? " on" : "")} onClick={() => setF({ ...f, conc: !f.conc })}>Concentration</button>
        <button className={"pill" + (f.ritual ? " on" : "")} onClick={() => setF({ ...f, ritual: !f.ritual })}>Ritual</button>
      </div>
      <Lbl>What it does</Lbl>
      <textarea rows={4} value={f.desc} onChange={set("desc")} placeholder="Include the dice and saving throw as written, and the sheet will offer the roll." />
      <div style={{ height: 6 }} />
      <Lbl>At higher levels (optional)</Lbl>
      <textarea rows={2} value={f.higher} onChange={set("higher")} />
      <button className="btn pri" style={{ marginTop: 8 }} disabled={!keepName && !f.name.trim()} onClick={() => {
        onSave({ ...f, name: (f.name || "").trim(), level: +f.level });
        if (!keepName) setF(blank);
      }}>{keepName ? "Save" : "Add spell"}</button>
    </div>
  );
}

// The library entry fields a spell carries, for editing it in place.
function libEntry(d) {
  return { id: d.libId, school: d.school, time: d.time, range: d.range, comp: d.comp, mat: d.mat, dur: d.dur, conc: d.conc, ritual: d.ritual, classes: d.classes, desc: d.desc, higher: d.higher, source: d.source };
}
