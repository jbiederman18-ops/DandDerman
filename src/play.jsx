import React, { useState, useEffect, useRef } from "react";
import * as E from "./dnd5e-engine.js";
import { SPIN_FACES } from "./theme.js";

const { ABIL, ABILNAME, sgn } = E;
const d = (n) => 1 + Math.floor(Math.random() * n);
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

// ================================================================ dice
// A d20 check. mode: "normal" | "adv" | "dis" — 5e rolls two dice and keeps one,
// which the overlay shows as the kept face with both numbers in the maths line.
export function rollCheck(label, mod, mode = "normal", opts = {}) {
  const a = d(20), b = mode === "normal" ? null : d(20);
  const nat = b == null ? a : mode === "adv" ? Math.max(a, b) : Math.min(a, b);
  const total = nat + mod;
  const crit = nat === 20, fumble = nat === 1;
  return {
    id: uid(), label, nat, mod, total, crit, fumble, mode, dc: opts.dc,
    face: nat, cycleMax: 20,
    math: (b == null ? "d20 " + a : "d20 " + a + " and " + b + " \u2014 keep the " + (mode === "adv" ? "higher" : "lower"))
      + (mod ? " " + sgn(mod) : "") + (opts.dc ? "  vs DC " + opts.dc : ""),
    big: total,
    glow: crit ? "crit" : fumble ? "fumble" : null,
    verdict: crit ? "NATURAL 20" : fumble ? "NATURAL 1" : null,
  };
}

export function rollExpr(expr, label, { crit = false, bonus = 0 } = {}) {
  const parts = [];
  let total = bonus;
  String(expr).replace(/\s+/g, "").split(/(?=[+-])/).forEach((p) => {
    const m = /^([+-]?)(\d*)d(\d+)$/.exec(p);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1, count = +(m[2] || 1) * (crit ? 2 : 1), die = +m[3];
      for (let i = 0; i < count; i++) { const r = d(die); parts.push(r * sign); total += r * sign; }
    } else if (p) total += +p || 0;
  });
  return {
    id: uid(), label, total, dmg: true,
    detail: parts.join(" + ") + (bonus ? " " + sgn(bonus) : "") + (crit ? "  (crit: dice doubled)" : ""),
    face: total, cycleMax: Math.max(6, total),
    math: parts.join(" + ") + (bonus ? " " + sgn(bonus) : ""),
    big: null, glow: crit ? "crit" : null, verdict: crit ? "CRITICAL HIT" : null,
  };
}

export function DiceOverlay({ roll, onDone, theme }) {
  const [face, setFace] = useState(1);
  const [phase, setPhase] = useState("rolling");
  useEffect(() => {
    setPhase("rolling");
    const spin = SPIN_FACES[theme];
    const tick = () => setFace(spin ? spin[Math.floor(Math.random() * spin.length)] : 1 + Math.floor(Math.random() * (roll.cycleMax || 20)));
    tick();
    const int = setInterval(tick, spin ? 105 : 55);
    const land = setTimeout(() => { clearInterval(int); setFace(roll.face); setPhase(roll.glow || "land"); }, 620);
    const close = setTimeout(onDone, 2200);
    return () => { clearInterval(int); clearTimeout(land); clearTimeout(close); };
  }, [roll.id, theme]);
  const done = phase !== "rolling";
  return (
    <div className="dicewrap" role="button" tabIndex={0} onClick={onDone}
      onKeyDown={(e) => (e.key === "Escape" || e.key === "Enter") && onDone()}>
      <div className="die" data-phase={phase}>{face}</div>
      <div className="critter" data-squash={phase === "crit" ? "1" : "0"} data-bite={phase === "fumble" ? "1" : "0"} />
      {phase === "crit" && <div className="coinpop"><i /><i /><i /></div>}
      <div className="dicelabel">{roll.label}</div>
      {done && <div className="dicemath">{roll.math}</div>}
      {done && roll.verdict && <div className={"diceverdict " + (phase === "fumble" ? "fumble" : "crit")}>{roll.verdict}</div>}
      {done && roll.big != null && <div className="big" style={{ fontSize: 30 }}>{roll.big}</div>}
      <div className="dicehint">Tap anywhere to dismiss</div>
    </div>
  );
}

const TRAY = [
  ["d20", { 20: 1 }], ["2d20 keep high", { 20: 2 }, "high"], ["2d20 keep low", { 20: 2 }, "low"],
  ["d4", { 4: 1 }], ["d6", { 6: 1 }], ["d8", { 8: 1 }], ["d10", { 10: 1 }], ["d12", { 12: 1 }], ["d100", { 100: 1 }],
];
const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceTray({ onRoll, onClose }) {
  const [pool, setPool] = useState({});
  const [mod, setMod] = useState(0);
  const [keep, setKeep] = useState("sum");
  const [label, setLabel] = useState("");
  const total = DICE.reduce((t, x) => t + (pool[x] || 0), 0);
  const hold = useRef({ timer: null, fired: false });
  const bump = (die, n) => setPool((p) => ({ ...p, [die]: Math.max(0, Math.min(20, (p[die] || 0) + n)) }));
  const press = (die) => ({
    onTouchStart: () => { hold.current.fired = false; hold.current.timer = setTimeout(() => { hold.current.fired = true; bump(die, -1); navigator.vibrate && navigator.vibrate(12); }, 450); },
    onTouchEnd: () => clearTimeout(hold.current.timer),
    onTouchMove: () => { clearTimeout(hold.current.timer); hold.current.fired = false; },
    onClick: () => { if (hold.current.fired) { hold.current.fired = false; return; } bump(die, 1); },
    onContextMenu: (e) => { e.preventDefault(); bump(die, -1); },
  });
  const summary = DICE.filter((x) => pool[x]).map((x) => pool[x] + "d" + x).join(" + ") || "nothing yet";
  const go = (p, m, k, name) => { onRoll(p, m, k, name); onClose(); };
  return (
    <Modal title="Roll dice" onClose={onClose}>
      <div className="chips" style={{ marginBottom: 10 }}>
        {TRAY.map(([name, p, k]) => <button key={name} className="pill" onClick={() => go(p, 0, k || "sum", name)}>{name}</button>)}
      </div>
      <div className="line" />
      <div className="grid g4">
        {DICE.map((x) => (
          <button key={x} className={"stat" + (pool[x] ? " on" : "")} style={{ padding: "8px 4px" }} {...press(x)}>
            <div className="v" style={{ fontSize: 18 }}>d{x}</div>
            <div className="l">{pool[x] ? pool[x] + " queued" : "tap to add"}</div>
          </button>
        ))}
      </div>
      <div className="mut xs" style={{ marginTop: 6 }}>Tap to add one, press and hold to take one back.</div>
      <div className="row wraprow" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => setMod((m) => m - 1)}>&minus;</button>
        <strong style={{ minWidth: 46, textAlign: "center" }}>{sgn(mod)}</strong>
        <button className="btn sm" onClick={() => setMod((m) => m + 1)}>+</button>
        <select value={keep} onChange={(e) => setKeep(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          <option value="sum">add them all up</option>
          <option value="high">keep the highest (advantage)</option>
          <option value="low">keep the lowest (disadvantage)</option>
        </select>
      </div>
      <input placeholder="What's it for? (optional)" value={label} style={{ marginTop: 8 }} onChange={(e) => setLabel(e.target.value)} />
      <div className="between" style={{ marginTop: 10 }}>
        <div className="mut sm">{summary}{mod ? " " + sgn(mod) : ""}</div>
        {total > 0 && <button className="btn sm" onClick={() => { setPool({}); setMod(0); }}>Clear</button>}
      </div>
      <button className="btn pri" style={{ width: "100%", marginTop: 8 }} disabled={!total}
        onClick={() => go(pool, mod, keep, label)}>Roll {total ? summary + (mod ? " " + sgn(mod) : "") : ""}</button>
    </Modal>
  );
}

export function rollPool(pool, mod, keep, label) {
  let rolled = [];
  DICE.forEach((die) => { for (let i = 0; i < (pool[die] || 0); i++) rolled.push({ die, v: d(die) }); });
  if (!rolled.length) return null;
  let kept = rolled;
  if (keep !== "sum" && rolled.length > 1) kept = [rolled.reduce((best, x) => ((keep === "high" ? x.v > best.v : x.v < best.v) ? x : best))];
  const total = kept.reduce((t, x) => t + x.v, 0) + mod;
  const one = kept.length === 1 && kept[0].die === 20;
  const detail = rolled.map((x) => "d" + x.die + " " + x.v).join(", ")
    + (keep === "high" ? " \u2192 keep highest" : keep === "low" ? " \u2192 keep lowest" : "") + (mod ? " " + sgn(mod) : "");
  return {
    id: uid(), label: label || (DICE.filter((x) => pool[x]).map((x) => pool[x] + "d" + x).join(" + ") + (mod ? " " + sgn(mod) : "")),
    total, detail, nat: kept.length === 1 ? kept[0].v : null,
    crit: one && kept[0].v === 20, fumble: one && kept[0].v === 1,
    face: kept.length === 1 ? kept[0].v : total, cycleMax: Math.max(6, kept.length === 1 ? kept[0].die : total),
    math: detail, big: mod || kept.length > 1 ? total : null,
    glow: one && kept[0].v === 20 ? "crit" : one && kept[0].v === 1 ? "fumble" : null,
    verdict: one && kept[0].v === 20 ? "NATURAL 20" : one && kept[0].v === 1 ? "NATURAL 1" : null,
  };
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheetin" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ================================================================ conditions and effects
const CONDITIONS = [
  ["blinded", "Blinded", "You can't see. Attacks against you have advantage; your attacks have disadvantage."],
  ["charmed", "Charmed", "You can't attack the charmer, who has advantage on social checks with you."],
  ["deafened", "Deafened", "You can't hear."],
  ["frightened", "Frightened", "Disadvantage on checks and attacks while the source is in sight."],
  ["grappled", "Grappled", "Speed 0."],
  ["incapacitated", "Incapacitated", "No actions or reactions."],
  ["invisible", "Invisible", "Attacks against you have disadvantage; yours have advantage."],
  ["paralyzed", "Paralyzed", "Incapacitated; auto-fail Str and Dex saves; hits within 5 ft are critical."],
  ["petrified", "Petrified", "Incapacitated, resistant to damage, auto-fail Str and Dex saves."],
  ["poisoned", "Poisoned", "Disadvantage on attacks and ability checks."],
  ["prone", "Prone", "Disadvantage on your attacks; melee attacks on you have advantage."],
  ["restrained", "Restrained", "Speed 0; disadvantage on attacks and Dex saves."],
  ["stunned", "Stunned", "Incapacitated; auto-fail Str and Dex saves."],
  ["unconscious", "Unconscious", "Prone, incapacitated, auto-fail Str and Dex saves."],
];

export function ConditionsModal({ c, dv, setChar, onClose }) {
  const co = c.conditions || {};
  const set = (k, v) => setChar(() => ({ conditions: { ...co, [k]: v } }));
  return (
    <Modal title="Conditions and exhaustion" onClose={onClose}>
      <div className="mut sm" style={{ marginTop: 0 }}>
        Whatever you set here is applied to your numbers straight away, and shows on the rolls it affects.
      </div>
      <div className="between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)" }}>
        <div style={{ flex: 1 }}>
          <div className="sm" style={{ fontWeight: 600 }}>Exhaustion</div>
          <div className="mut xs">
            {dv.system === "2024" ? "2024: \u22122 on every d20 test per level, and \u22125 ft speed. Death at 6."
              : "2014: a six-step ladder \u2014 disadvantage, half speed, and worse. Death at 6."}
          </div>
        </div>
        <Counter v={+c.exhaustion || 0} set={(v) => setChar(() => ({ exhaustion: clamp(v, 0, 6) }))} />
      </div>
      {CONDITIONS.map(([k, name, desc]) => (
        <div className="between" key={k} style={{ padding: "8px 0", borderBottom: "1px solid var(--line2)" }}>
          <div style={{ flex: 1 }}>
            <div className="sm" style={{ fontWeight: 600 }}>{name}</div>
            <div className="mut xs">{desc}</div>
          </div>
          {k === "frightened"
            ? <Counter v={+co[k] || 0} set={(v) => set(k, clamp(v, 0, 9))} />
            : <button className={"btn sm" + (co[k] ? " pri" : "")} onClick={() => set(k, co[k] ? 0 : 1)}>{co[k] ? "On" : "Off"}</button>}
        </div>
      ))}
    </Modal>
  );
}

const EFFECT_TARGETS = [["ac", "AC"], ["atk", "Attack rolls"], ["dmg", "Damage"], ["saves", "All saves"],
  ["init", "Initiative"], ["speed", "Speed (feet)"], ["spellDC", "Spell save DC"], ["spellAtk", "Spell attacks"]];
const PRESETS = [
  { name: "Bless", rounds: 10, b: { atk: 0, saves: 0 }, dice: "1d4", note: "+1d4 to attacks and saves \u2014 roll it when you use it" },
  { name: "Shield of Faith", rounds: 100, b: { ac: 2 } },
  { name: "Haste", rounds: 10, b: { ac: 2 }, note: "Extra action, double speed" },
  { name: "Bardic Inspiration", rounds: 100, dice: "1d6", note: "Add the die to one roll" },
  { name: "Fighting defensively (house rule)", rounds: 1, b: { ac: 2 } },
  { name: "Cover (half)", rounds: null, b: { ac: 2 } },
  { name: "Cover (three-quarters)", rounds: null, b: { ac: 5 } },
  { name: "Bane", rounds: 10, dice: "-1d4", note: "Subtract the die from attacks and saves" },
];

export function EffectsModal({ c, setChar, onClose }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("ac");
  const [amount, setAmount] = useState("2");
  const [rounds, setRounds] = useState("");
  const add = (fx) => { setChar((x) => ({ effects: [...(x.effects || []), { ...fx, id: uid() }] })); onClose(); };
  return (
    <Modal title="Add a temporary effect" onClose={onClose}>
      <div className="mut sm" style={{ marginTop: 0 }}>
        Nothing here touches your saved numbers. While it runs, the sheet shows the buffed value; when it ends
        or counts out, everything snaps back on its own.
      </div>
      <div className="line" />
      <div className="xs mut" style={{ fontWeight: 600, marginBottom: 6 }}>Common ones</div>
      <div className="chips">
        {PRESETS.map((p) => <button key={p.name} className="pill" onClick={() => add({ ...p, b: { ...(p.b || {}) } })}>{p.name}</button>)}
      </div>
      <div className="line" />
      <div className="xs mut" style={{ fontWeight: 600, marginBottom: 6 }}>Or build one</div>
      <input placeholder="What is it? (a potion, the DM's weird curse\u2026)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row wraprow" style={{ marginTop: 8 }}>
        <input inputMode="numeric" value={amount} aria-label="Bonus" style={{ width: 64 }}
          onChange={(e) => setAmount(e.target.value.replace(/[^-\d]/g, ""))} />
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          <optgroup label="Common">{EFFECT_TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
          <optgroup label="One skill">{E.ABIL && null}</optgroup>
        </select>
        <input inputMode="numeric" placeholder="Rounds (blank = open)" value={rounds} style={{ flex: 1, minWidth: 130 }}
          onChange={(e) => setRounds(e.target.value.replace(/\D/g, ""))} />
      </div>
      <button className="btn pri" style={{ width: "100%", marginTop: 10 }} disabled={!+amount}
        onClick={() => add({
          name: name.trim() || (EFFECT_TARGETS.find(([k]) => k === target) || [])[1] + " " + sgn(+amount || 0),
          rounds: rounds ? Math.max(1, +rounds) : null, b: { [target]: +amount || 0 },
        })}>Add effect</button>
    </Modal>
  );
}

const tickEffects = (list) => (list || []).map((f) => (f.rounds == null ? f : { ...f, rounds: f.rounds - 1 }))
  .filter((f) => f.rounds == null || f.rounds > 0);

function Counter({ v, set }) {
  return (
    <div className="row">
      <button className="btn sm" onClick={() => set(v - 1)}>&minus;</button>
      <strong style={{ minWidth: 18, textAlign: "center" }}>{v}</strong>
      <button className="btn sm" onClick={() => set(v + 1)}>+</button>
    </div>
  );
}

// ================================================================ the Play tab
export function Play({ c, dv, D, setChar, roll, setModal, setToast }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("normal");
  const hp = c.hp == null ? dv.hpMax : c.hp;
  const pct = clamp(Math.round((hp / Math.max(1, dv.hpMax)) * 100), 0, 100);
  const co = c.conditions || {};
  const active = Object.entries(co).filter(([, v]) => v);
  const fx = c.effects || [];

  const apply = (dir) => {
    const n = parseInt(amount || "0", 10) || 0;
    if (!n) return;
    const patch = dir < 0 ? E.applyDamage(c, dv, n) : E.applyHeal(c, dv, n);
    setChar(() => patch);
    setAmount("");
    const ev = (patch.events || [])[0];
    if (ev?.type === "concentration") setToast(`Concentration: DC ${ev.dc} Constitution save`);
    else if (ev?.type === "down") setToast("Down at 0 HP \u2014 death saves");
    else if (ev?.type === "dead") setToast("Killed outright by massive damage");
  };
  const check = (label, mod, opts) => roll(rollCheck(label, mod, mode, opts));
  const advNote = mode === "normal" ? "" : mode === "adv" ? " with advantage" : " with disadvantage";

  const slots = dv.spell.slotState;
  const pact = dv.spell.pact;

  return (
    <>
      {/* ---- hit points ---- */}
      <div className="card">
        <div className="between" style={{ alignItems: "flex-end", marginBottom: 8 }}>
          <div>
            <span className="hpnum">{hp}</span>
            <span className="mut" style={{ fontSize: 18 }}> / {dv.hpMax}</span>
            {dv.tempHp ? <span className="pill on" style={{ marginLeft: 8 }}>+{dv.tempHp} temp</span> : null}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => setModal("conditions")}>Conditions</button>
            <button className="btn sm" onClick={() => setChar(() => E.longRest(c, dv))}>Long rest</button>
          </div>
        </div>
        <div className="hpbar"><div className="hpfill" style={{ width: pct + "%" }} /></div>
        <div className="row" style={{ marginTop: 10 }}>
          <input inputMode="numeric" placeholder="Amount" value={amount} style={{ flex: 1 }}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          <button className="btn dan" onClick={() => apply(-1)}>Damage</button>
          <button className="btn gd" onClick={() => apply(1)}>Heal</button>
        </div>
        <div className="row wraprow" style={{ marginTop: 8 }}>
          {[1, 5, 10, 15, 20].map((n) => <button key={n} className="btn sm" onClick={() => setAmount(String(n))}>{n}</button>)}
          <input inputMode="numeric" placeholder="Temp HP" value={c.tempHp || ""} style={{ width: 96, marginLeft: "auto" }}
            onChange={(e) => setChar(() => ({ tempHp: +e.target.value.replace(/\D/g, "") || 0 }))} />
        </div>
        {Boolean(hp === 0 || c.dead || c.deathSaves?.s || c.deathSaves?.f) && (
          <>
            <div className="line" />
            <div className="between">
              <div>
                <div className="sm" style={{ fontWeight: 700 }}>{c.dead ? "Dead" : "Death saves"}</div>
                <div className="mut xs">
                  {"\u25CF".repeat(c.deathSaves?.s || 0)}{"\u25CB".repeat(3 - (c.deathSaves?.s || 0))} successes
                  {"  "}
                  {"\u25CF".repeat(c.deathSaves?.f || 0)}{"\u25CB".repeat(3 - (c.deathSaves?.f || 0))} failures
                </div>
              </div>
              <div className="row">
                <button className="btn sm" disabled={c.dead} onClick={() => {
                  const nat = d(20);
                  const patch = E.deathSave(c, nat);
                  setChar(() => patch);
                  roll({ ...rollCheck("Death save", 0), label: "Death save", nat, mod: 0, total: nat, big: nat, math: "d20 " + nat + "  vs DC 10" });
                  const ev = (patch.events || [])[0];
                  if (ev) setToast({ revive: "Back up at 1 HP", stable: "Stable", dead: "Dead" }[ev.type] || "");
                }}>Roll</button>
                <button className="btn sm" onClick={() => setChar(() => ({ deathSaves: { s: 0, f: 0 }, dead: false }))}>Reset</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---- the headline numbers ---- */}
      <div className="grid g4">
        <Stat v={dv.ac} l="Armor Class" s={dv.acBreakdown[0]} />
        <Stat v={sgn(dv.init)} l="Initiative" onClick={() => check("Initiative", dv.init)} />
        <Stat v={dv.speed + " ft"} l="Speed" s={dv.speedNotes[0]} />
        <Stat v={dv.passive.perception} l="Passive Perception" />
      </div>
      <div className="grid g3" style={{ marginTop: 8 }}>
        <Stat v={sgn(dv.pb)} l="Proficiency" />
        <Stat v={dv.hitDice.map((h) => `${h.total - h.used}d${h.die}`).join(" ")} l="Hit dice left"
          onClick={() => setModal("rest")} />
        <Stat v={c.inspiration ? "Yes" : "No"} l={dv.system === "2024" ? "Heroic Inspiration" : "Inspiration"}
          onClick={() => setChar(() => ({ inspiration: !c.inspiration }))} />
      </div>

      {/* ---- how you're rolling ---- */}
      <div className="card">
        <div className="between">
          <div className="chips">
            {[["normal", "Straight"], ["adv", "Advantage"], ["dis", "Disadvantage"]].map(([k, l]) => (
              <button key={k} className={"pill" + (mode === k ? " on" : "")} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          <button className="btn sm" onClick={() => setModal("dice")}>Dice tray</button>
        </div>
        <div className="mut xs" style={{ marginTop: 6 }}>
          Every roll below uses this until you change it{mode === "normal" ? "." : " \u2014 two dice, keeping the " + (mode === "adv" ? "higher" : "lower") + "."}
        </div>
      </div>

      {/* ---- conditions and effects ---- */}
      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <h3 data-icon="fire" style={{ margin: 0 }}>Conditions and effects</h3>
          <div className="row">
            {(fx.length > 0 || co.frightened) && (
              <button className="btn sm" onClick={() => setChar((x) => ({ effects: tickEffects(x.effects) }))}>Next round</button>
            )}
            <button className="btn sm" onClick={() => setModal("effects")}>Add</button>
          </div>
        </div>
        {active.length === 0 && fx.length === 0 && !dv.exhaustion && (
          <div className="mut sm">Nothing running. Anything you add folds into the numbers above and comes straight back off when it ends.</div>
        )}
        {dv.exhaustion > 0 && <div className="warn">Exhaustion {dv.exhaustion}{dv.d20Penalty ? ` \u2014 \u2212${dv.d20Penalty} on every d20 test` : ""}</div>}
        <div className="chips">
          {active.map(([k, v]) => {
            const def = CONDITIONS.find((x) => x[0] === k);
            return (
              <button key={k} className="pill on" title={def ? def[2] : ""}
                onClick={() => setChar(() => ({ conditions: { ...co, [k]: k === "frightened" ? Math.max(0, +v - 1) : 0 } }))}>
                {def ? def[1] : k}{k === "frightened" && +v > 1 ? " " + v : ""} &times;
              </button>
            );
          })}
        </div>
        {fx.map((f) => (
          <div className="atk" key={f.id}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650 }}>{f.name}</div>
              <div className="mut xs">
                {Object.entries(f.b || {}).filter(([, v]) => +v).map(([k, v]) => sgn(+v) + " " + ((EFFECT_TARGETS.find((t) => t[0] === k) || [k, k])[1].toLowerCase())).join(", ")
                  || f.dice || "no bonus"}{f.note ? " \u00b7 " + f.note : ""}
              </div>
            </div>
            <div className="row">
              {f.dice ? <button className="btn sm" onClick={() => roll(rollExpr(f.dice.replace("-", ""), f.name))}>{f.dice}</button> : null}
              <span className="pill on">{f.rounds == null ? "open" : f.rounds + " rd"}</span>
              <button className="btn sm dan" onClick={() => setChar((x) => ({ effects: (x.effects || []).filter((y) => y.id !== f.id) }))}>End</button>
            </div>
          </div>
        ))}
        {c.concentration && (
          <div className="note" style={{ marginBottom: 0 }}>
            Concentrating on <strong>{c.concentration}</strong>.{" "}
            <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setChar(() => ({ concentration: null }))}>Drop it</button>
          </div>
        )}
      </div>

      <div className="cols">
        <div>
          {/* ---- attacks ---- */}
          <div className="card">
            <div className="between" style={{ marginBottom: 4 }}>
              <h3 data-icon="fire" style={{ margin: 0 }}>Attacks</h3>
              {dv.extraAttacks ? <span className="badge gold">{dv.extraAttacks + 1} attacks per action</span> : null}
            </div>
            {dv.attacks.map((w) => (
              <div className="atk" key={w.id}>
                <div>
                  <div style={{ fontWeight: 700 }}>{w.name}</div>
                  <div className="mut xs">
                    {w.dice}{w.dmg ? sgn(w.dmg) : ""} {w.dmgType} {"\u00b7"} {w.range}
                    {w.mastery ? ` \u00b7 ${w.mastery}${w.masteryOn ? "" : " (not mastered)"}` : ""}
                    {w.notes.length ? " \u00b7 " + w.notes.join(", ") : ""}
                  </div>
                  <div className="row" style={{ marginTop: 5 }}>
                    <button className="btn sm" onClick={() => roll(rollExpr(w.dice, w.name + " damage", { bonus: w.dmg }))}>Damage</button>
                    <button className="btn sm" onClick={() => roll(rollExpr(w.dice, w.name + " \u2014 critical", { bonus: w.dmg, crit: true }))}>Crit</button>
                  </div>
                </div>
                <div className="maps">
                  <button className="mapb" onClick={() => check(w.name + advNote, w.atk)}>
                    {sgn(w.atk)}<small>to hit</small>
                  </button>
                </div>
              </div>
            ))}
            {dv.attackExtras.length > 0 && <div className="xs mut" style={{ marginTop: 6 }}>{dv.attackExtras.join(" \u00b7 ")}</div>}
          </div>

          {/* ---- saves ---- */}
          <div className="card">
            <h3 data-icon="shield">Saving throws</h3>
            {ABIL.map((a) => {
              const s = dv.saves[a];
              return (
                <div className="skrow" key={a}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className={"dot" + (s.prof ? " p2" : "")} />{ABILNAME[a]}
                    {s.autoFail ? <span className="badge">auto-fail</span> : s.dis.length ? <span className="badge" title={s.dis.join(", ")}>disadv.</span> : null}
                  </span>
                  <button className="mo" onClick={() => check(ABILNAME[a] + " save" + advNote, s.mod)}>{sgn(s.mod)}</button>
                </div>
              );
            })}
            <div className="line" />
            <div className="chips">
              {ABIL.map((a) => (
                <button key={a} className="pill" onClick={() => check(ABILNAME[a] + " check" + advNote, dv.m[a])}>
                  {a.toUpperCase()} {sgn(dv.m[a])}
                </button>
              ))}
            </div>
          </div>

          {/* ---- class resources ---- */}
          {dv.resources.length > 0 && (
            <div className="card">
              <div className="between" style={{ marginBottom: 4 }}>
                <h3 data-icon="star" style={{ margin: 0 }}>Class resources</h3>
                <button className="btn sm" onClick={() => setModal("rest")}>Rest</button>
              </div>
              {dv.resources.map((r) => (
                <div className="skrow" key={r.key}>
                  <span>
                    {r.name}
                    {r.note ? <span className="xs mut"> {"\u00b7"} {r.note}</span> : null}
                    <span className="xs mut"> {"\u00b7"} {r.reset} rest</span>
                  </span>
                  <div className="row">
                    {r.pool ? (
                      <>
                        <span className="sm">{r.max - r.used} / {r.max}</span>
                        <Counter v={r.used} set={(v) => setChar((x) => ({ resourcesUsed: { ...(x.resourcesUsed || {}), [r.key]: clamp(v, 0, r.max) } }))} />
                      </>
                    ) : (
                      <div className="chips">
                        {Array.from({ length: Math.min(r.max, 12) }).map((_, i) => (
                          <button key={i} aria-label={r.name + " use " + (i + 1)}
                            onClick={() => setChar((x) => ({ resourcesUsed: { ...(x.resourcesUsed || {}), [r.key]: i < r.used ? i : i + 1 } }))}
                            style={{
                              width: 20, height: 20, borderRadius: 6, border: "var(--bd) solid var(--line)",
                              background: i < r.used ? "var(--steel)" : "var(--pan2)",
                            }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {/* ---- skills ---- */}
          <div className="card">
            <h3 data-icon="book">Skills</h3>
            {Object.entries(dv.skills).map(([k, s]) => (
              <div className="skrow" key={k}>
                <span className="row" style={{ gap: 8 }}>
                  <span className={"dot" + (s.prof >= 2 ? " p2" : s.prof >= 1 ? " p1" : s.why ? " ph" : "")} />
                  <span>{s.name} <span className="xs mut">{s.abil}</span></span>
                  {s.dis.length ? <span className="badge" title={s.dis.join(", ")}>disadv.</span> : null}
                </span>
                <button className="mo" onClick={() => check(s.name + advNote, s.mod)}>{sgn(s.mod)}</button>
              </div>
            ))}
          </div>

          {/* ---- spellcasting ---- */}
          {dv.spell.casters.length > 0 && (
            <div className="card">
              <h3 data-icon="star">Spellcasting</h3>
              {dv.spell.casters.map((k) => (
                <div className="skrow" key={k.cls}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{k.name}</div>
                    <div className="xs mut">
                      {ABILNAME[k.ability]}
                      {k.cantrips != null ? ` \u00b7 ${k.cantrips} cantrips` : ""}
                      {k.known != null ? ` \u00b7 ${k.known} known` : ""}
                      {k.prepared != null ? ` \u00b7 ${k.prepared} prepared` : ""}
                    </div>
                  </div>
                  <div className="row">
                    <span className="sm">DC <strong>{k.dc}</strong></span>
                    <button className="mapb" onClick={() => check(k.name + " spell attack" + advNote, k.atk)}>
                      {sgn(k.atk)}<small>attack</small>
                    </button>
                  </div>
                </div>
              ))}
              {slots.map((s) => (
                <div className="skrow" key={s.level}>
                  <span className="sm">{ordinal(s.level)} level</span>
                  <div className="row">
                    <div className="chips">
                      {Array.from({ length: s.max }).map((_, i) => (
                        <button key={i} aria-label={ordinal(s.level) + " slot " + (i + 1)}
                          onClick={() => setChar((x) => ({ slotsUsed: { ...(x.slotsUsed || {}), [s.level]: i < s.used ? i : i + 1 } }))}
                          style={{
                            width: 22, height: 22, borderRadius: 6, border: "var(--bd) solid var(--line)",
                            background: i < s.used ? "var(--vio)" : "var(--pan2)",
                          }} />
                      ))}
                    </div>
                    <span className="xs mut">{s.max - s.used} left</span>
                  </div>
                </div>
              ))}
              {pact && (
                <div className="skrow">
                  <span className="sm">Pact slots {"\u00b7"} {ordinal(pact.level)}</span>
                  <div className="row">
                    <div className="chips">
                      {Array.from({ length: pact.count }).map((_, i) => (
                        <button key={i} aria-label={"Pact slot " + (i + 1)}
                          onClick={() => setChar(() => ({ pactUsed: i < (c.pactUsed || 0) ? i : i + 1 }))}
                          style={{
                            width: 22, height: 22, borderRadius: 6, border: "var(--bd) solid var(--brass)",
                            background: i < (c.pactUsed || 0) ? "var(--brass)" : "var(--pan2)",
                          }} />
                      ))}
                    </div>
                    <span className="xs mut">short rest</span>
                  </div>
                </div>
              )}
              {dv.spell.alwaysPrepared.length > 0 && (
                <div className="xs mut" style={{ marginTop: 6 }}>
                  Always prepared: {dv.spell.alwaysPrepared.map((s) => s.name).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* ---- abilities ---- */}
          <div className="card">
            <h3 data-icon="gem">Abilities</h3>
            <div className="grid g3">
              {ABIL.map((a) => (
                <button className="ab" key={a} onClick={() => check(ABILNAME[a] + " check" + advNote, dv.m[a])}>
                  <div className="lb">{ABILNAME[a]}</div>
                  <div className="sc">{sgn(dv.m[a])}</div>
                  <div className="xs mut">score {dv.ab[a]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ---- pinned features ---- */}
          {(c.favorites || []).length > 0 && (
            <div className="card">
              <h3 data-icon="flag">Quick reference</h3>
              {dv.features.filter((f) => (c.favorites || []).includes(f.key)).map((f) => (
                <details className="ft" key={f.key}>
                  <summary><span className="ttl">{f.name}</span><span className="badge">{f.from}</span></summary>
                  <div className="md"><p>{f.desc}</p></div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ v, l, s, onClick }) {
  const inner = (<><div className="v">{v}</div><div className="l">{l}</div>{s ? <div className="s">{s}</div> : null}</>);
  return onClick ? <button className="stat" onClick={onClick}>{inner}</button> : <div className="stat">{inner}</div>;
}

// ================================================================ rests
export function RestModal({ c, dv, setChar, roll, onClose, setToast }) {
  const [spend, setSpend] = useState({});
  const total = Object.values(spend).reduce((t, n) => t + n, 0);
  return (
    <Modal title="Rest" onClose={onClose}>
      <div className="sm" style={{ fontWeight: 700, marginBottom: 4 }}>Short rest</div>
      <div className="mut xs" style={{ marginBottom: 8 }}>
        Spend hit dice to heal, and recover anything that comes back on a short rest.
      </div>
      {dv.hitDice.map((h) => (
        <div className="skrow" key={h.die}>
          <span className="sm">d{h.die} {"\u00b7"} {h.total - h.used} available</span>
          <Counter v={spend[h.die] || 0} set={(v) => setSpend((s) => ({ ...s, [h.die]: clamp(v, 0, h.total - h.used) }))} />
        </div>
      ))}
      <button className="btn pri" style={{ width: "100%", marginTop: 10 }}
        onClick={() => {
          const rolls = [];
          Object.entries(spend).forEach(([die, n]) => { for (let i = 0; i < n; i++) rolls.push(d(+die)); });
          const patch = E.shortRest(c, dv, { spend, rolls });
          const healed = rolls.reduce((t, r) => t + Math.max(0, r + dv.m.con), 0);
          setChar(() => patch);
          if (rolls.length) roll({ id: uid(), label: "Short rest \u2014 hit dice", total: healed, dmg: true, detail: rolls.join(" + ") + " " + sgn(dv.m.con) + " each", face: healed, cycleMax: Math.max(6, healed), math: rolls.join(" + ") + (dv.m.con ? " " + sgn(dv.m.con) + " per die" : ""), big: null });
          else setToast("Short rest taken");
          onClose();
        }}>
        {total ? `Take a short rest, spending ${total} hit ${total === 1 ? "die" : "dice"}` : "Take a short rest"}
      </button>
      <div className="line" />
      <div className="sm" style={{ fontWeight: 700, marginBottom: 4 }}>Long rest</div>
      <div className="mut xs" style={{ marginBottom: 8 }}>
        Full hit points, every slot and resource back, half your hit dice recovered, and one level of exhaustion off.
      </div>
      <button className="btn" style={{ width: "100%" }}
        onClick={() => { setChar(() => E.longRest(c, dv)); setToast("Long rest \u2014 everything restored"); onClose(); }}>
        Take a long rest
      </button>
    </Modal>
  );
}
