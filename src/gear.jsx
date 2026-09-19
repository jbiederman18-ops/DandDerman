import React, { useState } from "react";
import * as E from "./dnd5e-engine.js";
import { libraryText as E_lib } from "./homebrew.js";
import { WikiLinks } from "./library.jsx";

// ================================================================ Gear tab
// Armor, shield, weapons, carried items, and coins. Everything here feeds straight into
// the engine, so AC, attacks, saves, and carrying weight on the Sheet tab follow along.

const sgn = E.sgn;
const uid = E.uid;
const COINS = [["pp", "Platinum", 10], ["gp", "Gold", 1], ["ep", "Electrum", 0.5], ["sp", "Silver", 0.1], ["cp", "Copper", 0.01]];
const CAT_LABEL = { light: "Light armor", medium: "Medium armor", heavy: "Heavy armor" };
const lb = (n) => (Math.round(n * 100) / 100).toLocaleString() + " lb";

function Step({ v, set, min = 0, max = 3, label }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn sm" aria-label={"Lower " + label} disabled={v <= min} onClick={() => set(v - 1)}>−</button>
      <strong style={{ minWidth: 26, textAlign: "center" }}>{v ? sgn(v) : "+0"}</strong>
      <button className="btn sm" aria-label={"Raise " + label} disabled={v >= max} onClick={() => set(v + 1)}>+</button>
    </div>
  );
}

function Toggle({ on, onClick, children, disabled }) {
  return <button className={"pill" + (on ? " on" : "")} aria-pressed={!!on} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Lbl({ children }) {
  return <div className="xs mut" style={{ marginBottom: 3, fontWeight: 600 }}>{children}</div>;
}

export function Gear({ c, dv, D, setChar, setToast }) {
  return (
    <>
      <GearSummary c={c} dv={dv} setChar={setChar} setToast={setToast} />
      <div className="cols">
        <div>
          <ArmorCard c={c} dv={dv} D={D} setChar={setChar} />
          <CoinsCard c={c} dv={dv} setChar={setChar} />
        </div>
        <div>
          <WeaponsCard c={c} dv={dv} D={D} setChar={setChar} />
        </div>
      </div>
      <ItemsCard c={c} dv={dv} D={D} setChar={setChar} setToast={setToast} />
    </>
  );
}

// ---------------------------------------------------------------- summary
function GearSummary({ c, dv, setChar, setToast }) {
  const acSet = +(c.bonuses || {}).acSet || 0;
  const pct = Math.min(100, (dv.carried / Math.max(1, dv.capacity)) * 100);
  return (
    <div className="card">
      <div className="grid g3">
        <div className="stat"><div className="v">{dv.ac}</div><div className="l">Armor Class</div><div className="s">{acSet ? "set by hand" : dv.acBreakdown[0]}</div></div>
        <div className="stat"><div className="v" style={{ color: dv.carried > dv.capacity ? "var(--crim)" : undefined }}>{Math.round(dv.carried)}</div><div className="l">Carried (lb)</div><div className="s">of {dv.capacity}</div></div>
        <div className="stat"><div className="v" style={{ color: dv.attuned > 3 ? "var(--crim)" : undefined }}>{dv.attuned}/3</div><div className="l">Attuned</div></div>
      </div>
      <div className="hpbar" style={{ marginTop: 10 }}><div className="hpfill" style={{ width: pct + "%", background: dv.carried > dv.capacity ? "var(--crim)" : "var(--brass)" }} /></div>
      <div className="xs mut" style={{ marginTop: 5 }}>
        Carrying capacity is Strength × 15. You can push, drag, or lift up to {dv.ab.str * 30} lb, moving at 5 feet per turn past {dv.capacity}.
      </div>
      {!acSet && dv.acBreakdown.length > 1 && <div className="xs mut" style={{ marginTop: 4 }}>AC: {dv.acBreakdown.join(" · ")}</div>}
      {acSet > 0 && (
        <div className="warn" style={{ marginTop: 10, marginBottom: 0 }}>
          Your AC is set by hand to {acSet}, left over from an import. From the gear below it works out to {dv.acCalc}
          {dv.acCalc === acSet ? " — the same, so the override can go." : ". Check your armor, shield, and items, then switch over."}
          <div className="row wraprow" style={{ marginTop: 8 }}>
            <button className="btn sm pri" onClick={() => { setChar((x) => ({ bonuses: { ...(x.bonuses || {}), acSet: 0 } })); setToast(`AC now follows your gear: ${dv.acCalc}`); }}>
              Use {dv.acCalc} from my gear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- armor & shield
function ArmorCard({ c, dv, D, setChar }) {
  const armor = dv.armor;
  const cats = ["light", "medium", "heavy"];
  const noProf = dv.warnings.filter((w) => /^Not proficient with/.test(w));
  return (
    <div className="card" data-card="armor">
      <h3 data-icon="shield">Armor and shield</h3>
      <Lbl>Armor</Lbl>
      <select value={c.armor || ""} onChange={(e) => setChar(() => ({ armor: e.target.value, armorMagic: e.target.value ? c.armorMagic || 0 : 0 }))}>
        <option value="">No armor</option>
        {cats.map((cat) => (
          <optgroup key={cat} label={CAT_LABEL[cat]}>
            {D.ARMOR.filter((a) => a.cat === cat).sort((a, b) => a.base - b.base).map((a) => (
              <option key={a.name} value={a.name}>{a.name} · AC {a.base}{a.dex ? (a.maxDex != null ? ` + Dex (max ${a.maxDex})` : " + Dex") : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {armor && (
        <>
          <div className="xs mut" style={{ margin: "6px 0 8px" }}>
            {CAT_LABEL[armor.cat]} · {armor.wt} lb
            {armor.str ? ` · needs Str ${armor.str}${dv.ab.str < armor.str ? " (you're short: −10 ft speed)" : ""}` : ""}
            {armor.stealthDis ? " · disadvantage on Stealth" : ""}
          </div>
          <div className="between" style={{ marginBottom: 6 }}>
            <span className="sm">Magic bonus</span>
            <Step label="armor bonus" v={+c.armorMagic || 0} set={(v) => setChar(() => ({ armorMagic: v }))} />
          </div>
        </>
      )}
      {!armor && (
        <div className="row wraprow" style={{ margin: "8px 0" }}>
          <Toggle on={c.flags?.mageArmor} onClick={() => setChar((x) => ({ flags: { ...(x.flags || {}), mageArmor: !x.flags?.mageArmor } }))}>
            Mage Armor running
          </Toggle>
          {dv.acOptions.length > 1 && <span className="xs mut">Using {dv.acOptions.reduce((b, o) => (o.ac > b.ac ? o : b)).label}</span>}
        </div>
      )}
      <div className="line" />
      <div className="between">
        <Toggle on={c.shield} onClick={() => setChar((x) => ({ shield: !x.shield, shieldMagic: x.shield ? 0 : x.shieldMagic || 0 }))}>
          {c.shield ? "Shield in hand · +2" : "No shield"}
        </Toggle>
        {c.shield && <Step label="shield bonus" v={+c.shieldMagic || 0} set={(v) => setChar(() => ({ shieldMagic: v }))} />}
      </div>
      {noProf.map((w) => <div key={w} className="warn" style={{ marginTop: 8, marginBottom: 0 }}>{w}. You have disadvantage on Strength and Dexterity rolls and attacks, and can't cast spells.</div>)}
    </div>
  );
}

// ---------------------------------------------------------------- weapons
function WeaponsCard({ c, dv, D, setChar }) {
  const [adding, setAdding] = useState("");
  const [custom, setCustom] = useState(null);
  const list = c.weapons || [];
  const upd = (id, patch) => setChar((x) => ({ weapons: (x.weapons || []).map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const add = (w) => setChar((x) => ({ weapons: [...(x.weapons || []), { id: uid(), magic: 0, ...w }] }));
  return (
    <div className="card" data-card="weapons">
      <h3 data-icon="fire">Weapons</h3>
      {!list.length && <div className="mut sm" style={{ marginBottom: 8 }}>Nothing yet besides your fists. Add a weapon and its attack shows up on the Sheet tab.</div>}
      {list.map((w) => {
        const base = w.base ? D.WEAPONS.find((x) => x.name === w.base) : null;
        const at = dv.attacks.find((a) => a.id === w.id);
        const props = w.custom?.props || base?.props || [];
        return (
          <details key={w.id} className="ft">
            <summary>
              <span className="ttl">{w.name || base?.name || "Weapon"}{+w.magic ? " " + sgn(+w.magic) : ""}</span>
              {at && <span className="row" style={{ gap: 6, marginLeft: "auto" }}>
                <span className="badge">{sgn(at.atk)} to hit</span>
                <span className="badge">{at.dice}{at.dmg ? sgn(at.dmg) : ""}</span>
              </span>}
            </summary>
            <div style={{ padding: "6px 0 4px" }}>
              {at && <div className="xs mut" style={{ marginBottom: 8 }}>
                {at.dmgType} · {at.range}{props.length ? " · " + props.join(", ") : ""}{at.mastery ? ` · ${at.mastery}${at.masteryOn ? "" : " (not mastered)"}` : ""}{at.notes.length ? " · " + at.notes.join(", ") : ""}
              </div>}
              <Lbl>Name</Lbl>
              <input value={w.name || ""} placeholder={base?.name || "Weapon"} onChange={(e) => upd(w.id, { name: e.target.value })} />
              <div className="between" style={{ margin: "8px 0" }}>
                <span className="sm">Magic bonus</span>
                <Step label="weapon bonus" v={+w.magic || 0} set={(v) => upd(w.id, { magic: v })} />
              </div>
              <div className="row wraprow" style={{ marginBottom: 8 }}>
                {base?.versatile && <Toggle on={w.twoHanded} onClick={() => upd(w.id, { twoHanded: !w.twoHanded, offhand: false })}>Two hands ({base.versatile})</Toggle>}
                {props.includes("light") && <Toggle on={w.offhand} onClick={() => upd(w.id, { offhand: !w.offhand, twoHanded: false })}>Off-hand</Toggle>}
              </div>
              <button className="btn sm dan" onClick={() => setChar((x) => ({ weapons: (x.weapons || []).filter((y) => y.id !== w.id) }))}>Remove</button>
            </div>
          </details>
        );
      })}
      <div className="line" />
      <div className="row">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} style={{ flex: 1 }}>
          <option value="">Add a weapon…</option>
          {["simple", "martial"].map((cat) => (
            <optgroup key={cat} label={cat === "simple" ? "Simple" : "Martial"}>
              {D.WEAPONS.filter((x) => x.cat === cat).map((x) => <option key={x.name} value={x.name}>{x.name} · {x.dmg} {x.type}</option>)}
            </optgroup>
          ))}
          <option value="__custom">Something else…</option>
        </select>
        <button className="btn sm pri" disabled={!adding} onClick={() => {
          if (adding === "__custom") setCustom({ name: "", dmg: "1d6", type: "slashing", cat: "martial", ranged: false, finesse: false });
          else add({ base: adding });
          setAdding("");
        }}>Add</button>
      </div>
      <div className="xs mut" style={{ marginTop: 5 }}>A +1 longsword is a longsword with its magic bonus raised.</div>
      {custom && (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radsm)", padding: 10, marginTop: 10 }}>
          <Lbl>Name</Lbl>
          <input value={custom.name} placeholder="Sun Blade" onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <div className="grid g2" style={{ marginTop: 8 }}>
            <div><Lbl>Damage dice</Lbl><input value={custom.dmg} onChange={(e) => setCustom({ ...custom, dmg: e.target.value.replace(/[^0-9d+]/gi, "") })} /></div>
            <div><Lbl>Damage type</Lbl><input value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value })} /></div>
          </div>
          <div className="row wraprow" style={{ margin: "8px 0" }}>
            <Toggle on={custom.cat === "martial"} onClick={() => setCustom({ ...custom, cat: custom.cat === "martial" ? "simple" : "martial" })}>{custom.cat === "martial" ? "Martial" : "Simple"}</Toggle>
            <Toggle on={custom.ranged} onClick={() => setCustom({ ...custom, ranged: !custom.ranged })}>{custom.ranged ? "Ranged" : "Melee"}</Toggle>
            <Toggle on={custom.finesse} onClick={() => setCustom({ ...custom, finesse: !custom.finesse })}>Finesse</Toggle>
          </div>
          <div className="row">
            <button className="btn sm pri" disabled={!custom.name.trim() || !/^\d*d\d+/.test(custom.dmg)} onClick={() => {
              add({ name: custom.name.trim(), custom: { dmg: custom.dmg, type: custom.type.toLowerCase(), cat: custom.cat, ranged: custom.ranged, props: custom.finesse ? ["finesse"] : [] } });
              setCustom(null);
            }}>Add weapon</button>
            <button className="btn sm" onClick={() => setCustom(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- coins
function CoinsCard({ c, dv, setChar }) {
  const coins = c.coins || {};
  const gp = COINS.reduce((t, [k, , v]) => t + (+coins[k] || 0) * v, 0);
  const set = (k, v) => setChar((x) => ({ coins: { ...(x.coins || {}), [k]: Math.max(0, v) } }));
  return (
    <div className="card" data-card="coins">
      <div className="between" style={{ marginBottom: 6 }}>
        <h3 data-icon="coin" style={{ margin: 0 }}>Coins</h3>
        <span className="sm mut">worth {(Math.round(gp * 100) / 100).toLocaleString()} gp · {lb(dv.coinWt)}</span>
      </div>
      <div className="grid g3">
        {COINS.map(([k, name]) => (
          <label key={k} style={{ display: "block" }}>
            <Lbl>{name} ({k})</Lbl>
            <input type="number" inputMode="numeric" min="0" value={coins[k] || 0} onChange={(e) => set(k, Math.floor(+e.target.value || 0))} />
          </label>
        ))}
      </div>
      <div className="xs mut" style={{ marginTop: 6 }}>Fifty coins weigh a pound.</div>
    </div>
  );
}

// ---------------------------------------------------------------- items
function ItemsCard({ c, dv, D, setChar, setToast }) {
  const items = c.items || [];
  const upd = (id, patch) => setChar((x) => ({ items: (x.items || []).map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const del = (id) => setChar((x) => ({ items: (x.items || []).filter((i) => i.id !== id) }));
  const add = (it) => { setChar((x) => ({ items: [...(x.items || []), { id: uid(), qty: 1, wt: 0, ...it }] })); setToast(`Added ${it.name}`); };
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("gear");
  const itemWt = items.reduce((t, i) => t + (+i.wt || 0) * (+i.qty || 1), 0);

  return (
    <div className="card" data-card="items">
      <div className="between" style={{ marginBottom: 6 }}>
        <h3 data-icon="box" style={{ margin: 0 }}>Items</h3>
        <span className="sm mut">{items.length} {items.length === 1 ? "item" : "items"} · {lb(itemWt)}</span>
      </div>
      {!items.length && <div className="mut sm">Your pack is empty. Search the equipment lists below or add your own.</div>}
      {items.map((raw) => {
        const it = E.withItemPreset(raw);
        const bonus = [+it.ac && `${sgn(+it.ac)} AC${it.unarmoredOnly ? " (no armor or shield)" : ""}`, +it.saves && `${sgn(+it.saves)} saves`].filter(Boolean);
        const dormant = it.attune && !it.attuned && bonus.length;
        return (
          <details key={it.id} className="ft">
            <summary>
              <span className="ttl">{it.name}{(+it.qty || 1) > 1 ? ` ×${it.qty}` : ""}</span>
              <span className="row" style={{ gap: 6, marginLeft: "auto" }}>
                {bonus.length > 0 && <span className="badge" style={dormant ? { opacity: 0.5 } : undefined}>{bonus.join(", ")}</span>}
                {it.attuned ? <span className="badge gold">attuned</span> : it.attune ? <span className="badge">attunement</span> : null}
              </span>
            </summary>
            <div style={{ padding: "6px 0 4px" }}>
              {dormant ? <div className="note">Needs attunement before its bonus counts.</div> : null}
              {it.note && <div className="xs mut" style={{ marginBottom: 6 }}>{it.note}</div>}
              <div className="grid g2">
                <label><Lbl>Quantity</Lbl><input type="number" inputMode="numeric" min="0" value={it.qty ?? 1} onChange={(e) => upd(it.id, { qty: Math.max(0, Math.floor(+e.target.value || 0)) })} /></label>
                <label><Lbl>Weight each (lb)</Lbl><input type="number" inputMode="decimal" min="0" step="0.25" value={it.wt || 0} onChange={(e) => upd(it.id, { wt: Math.max(0, +e.target.value || 0) })} /></label>
                <label><Lbl>AC bonus</Lbl><input type="number" inputMode="numeric" value={it.ac || 0} onChange={(e) => upd(it.id, { ac: +e.target.value || 0 })} /></label>
                <label><Lbl>Save bonus</Lbl><input type="number" inputMode="numeric" value={it.saves || 0} onChange={(e) => upd(it.id, { saves: +e.target.value || 0 })} /></label>
              </div>
              <div className="row wraprow" style={{ margin: "8px 0" }}>
                <Toggle on={it.attune} onClick={() => upd(it.id, { attune: !it.attune, attuned: it.attune ? false : it.attuned })}>Needs attunement</Toggle>
                {it.attune && <Toggle on={it.attuned} onClick={() => upd(it.id, { attuned: !it.attuned })}>{it.attuned ? "Attuned" : "Not attuned"}</Toggle>}
                {+it.ac ? <Toggle on={it.unarmoredOnly} onClick={() => upd(it.id, { unarmoredOnly: !it.unarmoredOnly })}>AC only without armor</Toggle> : null}
              </div>
              {(it.desc || E_lib(D, it.name)) && <div className="md xs" style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{it.desc || E_lib(D, it.name)}</div>}
              {(it.magicItem || it.attune || it.attuned) && <div style={{ marginBottom: 8 }}><WikiLinks kind="item" name={it.name} system={c.system} /></div>}
              <button className="btn sm dan" onClick={() => del(it.id)}>Remove</button>
            </div>
          </details>
        );
      })}
      <div className="line" />
      <div className="chips" style={{ marginBottom: 8 }}>
        {[["gear", "Equipment"], ["magic", "Magic items"], ["own", "Your own"]].map(([k, l]) => (
          <button key={k} className={"pill" + (src === k ? " on" : "")} onClick={() => setSrc(k)}>{l}</button>
        ))}
      </div>
      {src === "own" ? <OwnItem onAdd={add} /> : <ItemSearch D={D} src={src} q={q} setQ={setQ} onAdd={add} />}
    </div>
  );
}

function ItemSearch({ D, src, q, setQ, onAdd }) {
  const pool = src === "magic" ? D.MAGIC_ITEMS || [] : D.GEAR || [];
  const needle = q.trim().toLowerCase();
  const hits = needle ? pool.filter((x) => x.name.toLowerCase().includes(needle)) : [];
  return (
    <>
      <input placeholder={src === "magic" ? "Search magic items (Ring of Protection, Bag of Holding…)" : "Search equipment (rope, rations, tinderbox…)"} value={q} onChange={(e) => setQ(e.target.value)} />
      {src === "magic" && <div className="xs mut" style={{ marginTop: 5 }}>Magic armor, shields, and weapons go above: choose the base item and raise its bonus.</div>}
      <div style={{ marginTop: 6 }}>
        {hits.slice(0, 40).map((x) => (
          <div key={x.name + (x.source || "")} className="skrow">
            <div style={{ minWidth: 0 }}>
              <div className="sm" style={{ fontWeight: 600 }}>{x.name}</div>
              <div className="xs mut">
                {src === "magic" ? [x.type, x.rarity, x.attune && "attunement"].filter(Boolean).join(" · ") : [x.cat, x.wt ? x.wt + " lb" : null, x.cost].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button className="btn sm" onClick={() => {
              const pre = E.itemPreset(x.name) || {};
              onAdd(src === "magic"
                ? { name: x.name, wt: 0, magicItem: true, attune: !!x.attune || !!pre.attune, rarity: x.rarity, desc: x.desc }
                : { name: x.name, wt: +x.wt || 0, desc: x.desc });
              setQ("");
            }}>Add</button>
          </div>
        ))}
        {needle && !hits.length && <div className="empty">Nothing by that name. Try “Your own”.</div>}
        {hits.length > 40 && <div className="xs mut">Showing 40 of {hits.length}. Keep typing to narrow it down.</div>}
      </div>
    </>
  );
}

function OwnItem({ onAdd }) {
  const blank = { name: "", qty: 1, wt: 0, ac: 0, saves: 0, attune: false, desc: "" };
  const [f, setF] = useState(blank);
  return (
    <>
      <Lbl>Name</Lbl>
      <input value={f.name} placeholder="Grandmother's locket" onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid g2" style={{ marginTop: 8 }}>
        <label><Lbl>Quantity</Lbl><input type="number" inputMode="numeric" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: Math.max(1, Math.floor(+e.target.value || 1)) })} /></label>
        <label><Lbl>Weight each (lb)</Lbl><input type="number" inputMode="decimal" min="0" step="0.25" value={f.wt} onChange={(e) => setF({ ...f, wt: Math.max(0, +e.target.value || 0) })} /></label>
        <label><Lbl>AC bonus</Lbl><input type="number" inputMode="numeric" value={f.ac} onChange={(e) => setF({ ...f, ac: +e.target.value || 0 })} /></label>
        <label><Lbl>Save bonus</Lbl><input type="number" inputMode="numeric" value={f.saves} onChange={(e) => setF({ ...f, saves: +e.target.value || 0 })} /></label>
      </div>
      <div className="row wraprow" style={{ margin: "8px 0" }}>
        <Toggle on={f.attune} onClick={() => setF({ ...f, attune: !f.attune })}>Needs attunement</Toggle>
      </div>
      <textarea rows={2} placeholder="What it does (optional)" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
      <button className="btn pri" style={{ marginTop: 8 }} disabled={!f.name.trim()} onClick={() => { onAdd({ ...f, name: f.name.trim() }); setF(blank); }}>Add item</button>
    </>
  );
}
