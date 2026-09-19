// dnd5e-engine.js — D&D 5e rules engine for the character sheet, for both the 2014 and 2024 rules.
//
// Every function takes the data module for that character's ruleset as `D`, and branches on
// D.SYSTEM ("2014" or "2024") only where the rules actually differ:
//   - ability increases come from the species (2014) or the background (2024)
//   - subclass level varies by class (2014) or is always 3 (2024)
//   - casters know spells (2014) or prepare a set number (2024)
//   - weapon mastery exists only in 2024
//   - exhaustion is a six-step ladder (2014) or −2 per level on every d20 test (2024)
// Pure functions, no React. Every function takes the data module as `D`
// (import * as D from "./dnd5e-data.js").
//
//   newChar(name)                 → blank character
//   derive(c, D)                  → everything the sheet displays
//   levelUpPlan(c, D, clsKey)     → what gaining a level in clsKey involves
//   applyLevelUp(c, D, clsKey, answers) → new character with that level added
//   damage / heal / setTempHp / deathSave / shortRest / longRest → state patches
//
// Characters store choices; derive() computes numbers. Nothing numeric is cached on the character
// except live play state (current HP, slots used, resource uses, conditions).

export const ABIL = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILNAME = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (totalLevel) => Math.ceil(Math.max(1, totalLevel) / 4) + 1;
export const sgn = (n) => (n >= 0 ? "+" : "") + n;
const uid = () => "x" + Math.random().toString(36).slice(2, 9);
const lc = (s) => String(s || "").toLowerCase();

// ---------------------------------------------------------------- character model
export function newChar(name, system = "2024") {
  return {
    id: "c" + Math.random().toString(36).slice(2, 9), v: 2, system,
    name: name || "New character", player: "", xp: 0, alignment: "",
    // origin
    race: "human", subrace: "", raceChoices: {},          // raceChoices: { asi: ["str","dex"], "Skill Versatility": ["stealth","insight"], ... }
    background: "acolyte", bgSkillPicks: [],
    bgAbility: [],              // 2024: +2/+1 or +1/+1/+1 from the background's three abilities
    bgFeatChoice: {},           // 2024: choices inside the background's origin feat (Magic Initiate spells, and so on)
    masteries: {},              // 2024: { [classKey]: ["Longsword", …] } weapons whose mastery you have active
    // ability scores: base scores before racial bonuses and ASIs
    abilityMethod: "standard", base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, scoreOverride: {},
    // classes, in the order taken. classes[0] is the starting class.
    // { cls, level, subclass, hp: [per-level rolls, index 0 = that class's 1st level; null = average],
    //   skills: [picked class skills], asi: { [classLevel]: {type:"asi", picks:["str","str"]} | {type:"feat", feat:key, picks:[]} } }
    classes: [{ cls: "fighter", level: 1, subclass: "", hp: [], skills: [], asi: {} }],
    choices: {},                // feature options, keyed "cls:Feature Name" → option name(s), e.g. "fighter:Fighting Style": "Fighting Style: Defense"
    expertise: [],              // skill keys
    extraSkills: [], extraSaves: [], extraProfs: [], languages: [], // from feats, custom features, DM rulings
    customFeatures: [],         // { id, name, source, desc, uses: {max, reset:"short"|"long"} }
    customFeats: [],            // { id, name, desc } for non-bundled feats taken outside ASIs
    // equipment
    armor: "", armorMagic: 0, shield: false, shieldMagic: 0,
    weapons: [],                // { id, base, name, magic, atkBonus, dmgBonus, twoHanded, offhand, ability, proficient, custom:{dmg,type,props,cat,ranged} }
    items: [],                  // { id, name, qty, wt, attuned, magicItem, desc, attune, ac, saves, unarmoredOnly }
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    // spells: { name, cls, prepared }
    spells: [],
    // live play state
    hp: null, tempHp: 0, hitDiceUsed: {}, deathSaves: { s: 0, f: 0 }, dead: false,
    slotsUsed: {}, pactUsed: 0, arcanumUsed: {}, resourcesUsed: {},
    conditions: {}, exhaustion: 0, inspiration: false, concentration: null,
    flags: { raging: false, mageArmor: false },   // toggles you flip mid-fight
    effects: [],                                   // temporary bonuses, each with its own duration
    bonuses: { ac: 0, acSet: 0, saves: 0, init: 0, speed: 0, hpPerLevel: 0, hpFlat: 0, spellAtk: 0, spellDC: 0 },
    notes: "", createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------- lookups
// A character can use a homebrew or non-bundled race/background by setting the key to "__custom"
// and filling in customRace / customBackground.
function customRace(c) {
  const r = c.customRace || {};
  return { key: "__custom", name: r.name || "Custom race", speed: +r.speed || 30, size: r.size || "Medium",
    asi: r.asi || {}, asiChoose: null, languages: r.languages || "", traits: r.traits || [], subraces: [], source: "custom" };
}
function customBackground(c) {
  const b = c.customBackground || {};
  return { key: "__custom", name: b.name || "Custom background", desc: "", skills: [], skillText: "Choose any two skills",
    tools: b.tools || "", languages: b.languages || "", equipment: b.equipment || "",
    feature: b.featureName ? { name: b.featureName, desc: b.featureDesc || "" } : null, source: "custom" };
}
const findRace = (c, D) => (c.race === "__custom" ? customRace(c) : D.RACES.find((r) => r.key === c.race) || D.RACES.find((r) => r.key === "human"));
const findSubrace = (race, c) => (race.subraces || []).find((s) => s.key === c.subrace) || null;
const findBg = (c, D) => (c.background === "__custom" ? customBackground(c) : D.BACKGROUNDS.find((b) => b.key === c.background) || null);
export const findSubclass = (D, cls, key) => (key ? D.SUBCLASSES.find((s) => s.key === key && s.cls === cls) : null);
const findFeat = (D, key) => D.FEATS.find((f) => f.key === key) || null;
const totalLevel = (c) => (c.classes || []).reduce((t, x) => t + (x.level || 0), 0);

// weapon proficiency names in the data are plural ("Longswords", "Crossbows, light");
// weapon names are singular ("Longsword", "Crossbow, light"). Compare as sorted singular tokens.
const wkey = (s) => lc(s).replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, "")).sort().join(" ");

// ---------------------------------------------------------------- abilities
export function computeAbilities(c, D) {
  const race = findRace(c, D), sub = findSubrace(race, c);
  const s = {}; ABIL.forEach((a) => (s[a] = +((c.base || {})[a]) || 10));
  const add = (a, n) => { if (a && s[a] != null) s[a] += n; };
  if (D.SYSTEM === "2024") {
    // the background grants +2/+1 or +1/+1/+1; c.bgAbility holds the picks in order
    const picks = (c.bgAbility || []).filter(Boolean);
    if (picks.length === 2) { add(picks[0], 2); add(picks[1], 1); }
    else picks.slice(0, 3).forEach((a) => add(a, 1));
  }
  Object.entries(race.asi || {}).forEach(([a, n]) => add(a, n));
  if (race.asiChoose) (c.raceChoices?.asi || []).slice(0, race.asiChoose.n).forEach((a) => add(a, race.asiChoose.bonus));
  if (sub) {
    Object.entries(sub.asi || {}).forEach(([a, n]) => add(a, n));
    if (sub.asiChoose) (c.raceChoices?.subAsi || []).slice(0, sub.asiChoose.n).forEach((a) => add(a, sub.asiChoose.bonus));
  }
  // ASIs and half-feats, capped at 20
  for (const cl of c.classes || []) {
    for (const [lv, pick] of Object.entries(cl.asi || {})) {
      if (+lv > cl.level || !pick) continue;
      (pick.picks || []).forEach((a) => { if (s[a] != null) s[a] = Math.min(20, s[a] + 1); });
    }
  }
  // feats taken outside an ability score improvement (a background feat, a DM award)
  (c.customFeats || []).forEach((f) => (f.picks || []).forEach((a) => { if (s[a] != null) s[a] = Math.min(20, s[a] + 1); }));
  // item/effect overrides like Amulet of Health ("score becomes 19" — only if higher)
  Object.entries(c.scoreOverride || {}).forEach(([a, v]) => { if (v && s[a] != null) s[a] = Math.max(s[a], +v); });
  return s;
}

export function pointBuySpent(base) {
  return ABIL.reduce((t, a) => t + (POINT_BUY_COST[base[a]] ?? 99), 0);
}

// ---------------------------------------------------------------- features
// Returns every feature the character has, with a stable key, for display and for rules checks.
export function collectFeatures(c, D) {
  const out = [];
  const race = findRace(c, D), sub = findSubrace(race, c);
  (race.traits || []).forEach((t) => out.push({ key: "race:" + t.name, name: t.name, desc: t.desc, from: race.name, kind: "race", trait: t }));
  if (sub) (sub.traits || []).forEach((t) => out.push({ key: "subrace:" + t.name, name: t.name, desc: t.desc, from: sub.name, kind: "race", trait: t }));
  const bg = findBg(c, D);
  if (bg?.feature) out.push({ key: "bg:" + bg.feature.name, name: bg.feature.name, desc: bg.feature.desc, from: bg.name, kind: "background" });

  for (const cl of c.classes || []) {
    const C = D.CLASSES[cl.cls]; if (!C) continue;
    const sc = findSubclass(D, cl.cls, cl.subclass);
    const optionParents = new Set(C.features.filter((f) => f.parent).map((f) => f.parent));
    for (const f of C.features) {
      if (f.parent || f.level > cl.level) continue;
      if (sc && /(archetype|path|college|domain|circle|tradition|oath|origin|patron) feature$/i.test(f.name)) continue; // placeholders
      if (/^Ability Score Improvement$/.test(f.name)) continue;
      const entry = { key: cl.cls + ":" + f.name, name: f.name, level: f.level, desc: f.desc, from: C.name, kind: "class", cls: cl.cls };
      const styleFeature = D.SYSTEM === "2024" && f.name === "Fighting Style";
      if (optionParents.has(f.name) || styleFeature) {
        entry.options = styleFeature
          ? D.FEATS.filter((x) => x.type === "fighting-style").map((x) => ({ name: x.name, desc: x.desc, level: f.level }))
          : C.features.filter((o) => o.parent === f.name && o.level <= cl.level);
        const chosen = [].concat(c.choices?.[entry.key] || []);
        entry.chosen = chosen;
        chosen.forEach((name) => {
          const o = entry.options.find((x) => x.name === name);
          if (o && styleFeature) { out.push({ key: cl.cls + ":" + o.name, name: o.name, desc: o.desc, from: "Fighting Style", kind: "option", cls: cl.cls }); return; }
          if (o) out.push({ key: cl.cls + ":" + o.name, name: o.name, desc: o.desc, from: C.name, kind: "option", cls: cl.cls });
        });
      }
      out.push(entry);
    }
    if (sc) for (const f of sc.features) {
      if (f.level > cl.level) continue;
      out.push({ key: cl.cls + ":sub:" + f.name, name: f.name, level: f.level, desc: f.desc, from: sc.name, kind: "subclass", cls: cl.cls });
    }
    for (const [lv, pick] of Object.entries(cl.asi || {})) {
      if (+lv > cl.level || pick?.type !== "feat") continue;
      const ft = findFeat(D, pick.feat);
      if (ft) out.push({ key: "feat:" + ft.key, name: ft.name, desc: ft.desc, from: "Feat", kind: "feat" });
      else if (pick.customName) out.push({ key: "feat:" + pick.customName, name: pick.customName, desc: pick.customDesc || "", from: "Feat", kind: "feat" });
    }
  }
  (c.classes || []).forEach((cl) => {
    if (cl.subclass === "__custom" && cl.subclassName) out.push({ key: cl.cls + ":sub:custom", name: cl.subclassName, desc: cl.subclassDesc || "", from: D.CLASSES[cl.cls]?.name, kind: "subclass", cls: cl.cls });
  });
  // Entries that came in with a name only pick up their text from the homebrew library.
  const libText = (list, name) => (list || []).find((x) => sameName(x.name, name))?.desc || "";
  (c.customFeats || []).forEach((f) => out.push({ key: "feat:" + f.name, name: f.name, desc: f.desc || libText(D.FEATS, f.name), from: "Feat", kind: "feat", custom: true, id: f.id }));
  (c.customFeatures || []).forEach((f) => out.push({ key: "custom:" + f.id, name: f.name, desc: f.desc || libText(D.LIB_FEATURES, f.name), from: f.source || "Custom", kind: "custom", custom: true, id: f.id, uses: f.uses }));
  return out;
}

// ---------------------------------------------------------------- proficiencies
function collectProfs(c, D, features) {
  const profs = new Set();
  const skills = new Set(), skillSources = {};
  const addSkill = (k, why) => { if (!k) return; skills.add(k); (skillSources[k] ||= []).push(why); };
  (c.classes || []).forEach((cl, i) => {
    const C = D.CLASSES[cl.cls]; if (!C) return;
    (i === 0 ? C.profs : C.mcProfs || []).forEach((p) => profs.add(p));
    (cl.skills || []).forEach((k) => addSkill(k, C.name));
  });
  const bg = findBg(c, D);
  if (bg) { (bg.skills || []).forEach((k) => addSkill(k, bg.name)); (c.bgSkillPicks || []).forEach((k) => addSkill(k, bg.name)); }
  features.filter((f) => f.trait).forEach((f) => {
    (f.trait.profs || []).forEach((p) => profs.add(p));
    (f.trait.skills || []).forEach((k) => addSkill(k, f.from));
    if (f.trait.choose) [].concat(c.raceChoices?.[f.name] || []).forEach((v) => {
      if (D.SKILLS.some((s) => s[0] === v)) addSkill(v, f.from); else profs.add(v);
    });
  });
  // "you gain proficiency with heavy armor" style class/subclass/feat features
  features.filter((f) => ["class", "subclass", "feat", "option"].includes(f.kind)).forEach((f) => {
    const t = lc(f.desc).split(/\n/).find((line) => /(gain|have) proficiency with/.test(line)) || "";
    [["heavy armor", "Heavy Armor"], ["medium armor", "Medium Armor"], ["light armor", "Light Armor"], ["martial weapons", "Martial Weapons"],
     ["simple weapons", "Simple Weapons"], ["shields", "Shields"]].forEach(([needle, p]) => { if (t.includes(needle)) profs.add(p); });
  });
  (c.extraSkills || []).forEach((k) => addSkill(k, "Other"));
  (c.extraProfs || []).forEach((p) => profs.add(p));
  const list = [...profs];
  const has = (name) => list.some((p) => lc(p) === lc(name));
  const armorProf = (cat) =>
    cat === "shield" ? has("Shields") : has("All armor") || has(cat + " armor");
  const weaponProf = (w) => {
    if (!w) return false;
    if (w.cat === "simple" && has("Simple Weapons")) return true;
    if (w.cat === "martial" && has("Martial Weapons")) return true;
    return list.some((p) => wkey(p) === wkey(w.name));
  };
  return { list, skills, skillSources, armorProf, weaponProf };
}

// ---------------------------------------------------------------- conditions → roll modifiers
function rollModifiers(c, armorUnproficient, system) {
  const co = c.conditions || {}, ex = +c.exhaustion || 0;
  const checks = [], attacks = [], saves = { str: [], dex: [], con: [], int: [], wis: [], cha: [] }, notes = [];
  const all = (arr, why) => ABIL.forEach((a) => saves[a].push(why));
  if (system === "2024") {
    if (ex >= 1) notes.push(`Exhaustion ${ex}: −${2 * ex} to every D20 Test, speed −${5 * ex} ft`);
  } else {
    if (ex >= 1) checks.push("Exhaustion");
    if (ex >= 3) { attacks.push("Exhaustion"); all(saves, "Exhaustion"); }
  }
  if (co.poisoned) { checks.push("Poisoned"); attacks.push("Poisoned"); }
  if (co.frightened) { checks.push("Frightened (source in sight)"); attacks.push("Frightened (source in sight)"); }
  if (co.blinded) { attacks.push("Blinded"); notes.push("Attacks against you have advantage"); }
  if (co.prone) { attacks.push("Prone"); notes.push("Melee attacks against you have advantage; ranged have disadvantage"); }
  if (co.restrained) { attacks.push("Restrained"); saves.dex.push("Restrained"); notes.push("Attacks against you have advantage"); }
  if (co.invisible) notes.push("Your attacks have advantage; attacks against you have disadvantage");
  const autoFail = co.paralyzed || co.stunned || co.unconscious || co.petrified;
  if (autoFail) notes.push("You automatically fail Strength and Dexterity saves");
  if (co.paralyzed || co.unconscious) notes.push("Attacks against you have advantage; hits within 5 ft are critical hits");
  if (co.incapacitated || co.paralyzed || co.stunned || co.unconscious || co.petrified) notes.push("You can't take actions or reactions");
  if (armorUnproficient) {
    checks.push("Armor without proficiency (Str/Dex)"); attacks.push("Armor without proficiency");
    saves.str.push("Armor without proficiency"); saves.dex.push("Armor without proficiency");
    notes.push("You can't cast spells while wearing armor you aren't proficient with");
  }
  return { checks, attacks, saves, autoFailStrDex: !!autoFail, notes };
}

// ---------------------------------------------------------------- spellcasting
function casterInfo(cl, D) {
  const C = D.CLASSES[cl.cls], sc = findSubclass(D, cl.cls, cl.subclass);
  if (C?.caster) return { type: C.caster, ability: C.castAbility, list: cl.cls, prep: C.prep };
  if (sc?.caster === "third" && cl.level >= 3) return { type: "third", ability: sc.castAbility || "int", list: sc.spellList || "wizard", prep: "known", sub: sc };
  return null;
}

function spellcasting(c, D, m, pb, bonuses) {
  const casters = [];
  let pact = null, casterLevel = 0, slotClasses = 0, single = null;
  for (const cl of c.classes || []) {
    const ci = casterInfo(cl, D); if (!ci) continue;
    const C = D.CLASSES[cl.cls];
    const row = C.levels[cl.level - 1] || {};
    const abMod = m[ci.ability];
    let cantrips = row.cantrips ?? null, known = row.known ?? null, prepared = row.prepared ?? null;
    if (ci.type === "third") {
      const t = ci.sub.table?.[cl.level] || ci.sub.table?.[String(cl.level)];
      cantrips = t?.cantrips ?? null; known = t?.known ?? null;
    }
    if (ci.type === "half" && cl.level < 2 && D.SYSTEM !== "2024") { cantrips = null; known = null; prepared = null; }
    // 2014 works out prepared spells from the ability modifier; 2024 prints the number on the class table
    if (D.SYSTEM !== "2024" && ci.prep === "prepared" && !(ci.type === "half" && cl.level < 2)) {
      prepared = Math.max(1, abMod + (ci.type === "half" ? Math.floor(cl.level / 2) : cl.level));
      known = null;
    }
    if (ci.type === "pact") {
      const slots = row.slots || [];
      const lvl = slots.findIndex((n) => n > 0);
      pact = { level: lvl + 1, count: slots[lvl] || 0, cls: cl.cls };
      const cs = row.cs || {};
      // The 2014 table has a column per arcanum; the 2024 one doesn't, but the levels are the same.
      let arcanum = [6, 7, 8, 9].filter((L) => cs["mystic_arcanum_level_" + L]);
      if (!arcanum.length) arcanum = [[11, 6], [13, 7], [15, 8], [17, 9]].filter(([at]) => cl.level >= at).map(([, L]) => L);
      if (arcanum.length) pact.arcanum = arcanum;
    } else {
      slotClasses++; single = { cl, ci, row };
      casterLevel += ci.type === "full" ? cl.level : ci.type === "half" ? Math.floor(cl.level / 2) : Math.floor(cl.level / 3);
    }
    const ownSlots = ci.type === "third"
      ? (D.THIRD_CASTER_SLOTS[cl.level] || D.THIRD_CASTER_SLOTS[String(cl.level)] || [])
      : (row.slots || []);
    let maxLevel = ownSlots.reduce((h, n, i) => (n > 0 ? i + 1 : h), 0);
    if (ci.type === "pact" && pact) maxLevel = Math.max(pact.level, ...(pact.arcanum || [0]));
    casters.push({
      cls: cl.cls, name: C.name + (ci.sub ? " (" + ci.sub.name + ")" : ""), type: ci.type, ability: ci.ability, list: ci.list, maxLevel,
      dc: 8 + pb + abMod + (bonuses.spellDC || 0), atk: pb + abMod + (bonuses.spellAtk || 0),
      cantrips, known, prepared, prep: ci.prep,
    });
  }
  let slots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (slotClasses === 1) {
    // a single slot-casting class uses its own table (matters for half/third casters at low level)
    const { cl, ci, row } = single;
    if (ci.type === "third") {
      const t = D.THIRD_CASTER_SLOTS[cl.level] || D.THIRD_CASTER_SLOTS[String(cl.level)] || [];
      slots = slots.map((_, i) => t[i] || 0);
    } else slots = (row.slots || slots).slice(0, 9);
  } else if (slotClasses > 1 && casterLevel > 0) {
    slots = (D.MULTICLASS_SLOTS[casterLevel] || D.MULTICLASS_SLOTS[String(casterLevel)] || slots).slice(0, 9);
  }
  const maxSpellLevel = Math.max(slots.reduce((h, n, i) => (n > 0 ? i + 1 : h), 0), pact ? Math.max(pact.level, ...(pact.arcanum || [0])) : 0);
  return { casters, slots, pact, casterLevel, maxSpellLevel };
}

// ---------------------------------------------------------------- class resources
function resources(c, D, m, features) {
  const out = [];
  const add = (key, name, max, reset, extra) => { if (max > 0) out.push({ key, name, max, reset, used: Math.min(max, +(c.resourcesUsed || {})[key] || 0), ...extra }); };
  for (const cl of c.classes || []) {
    const C = D.CLASSES[cl.cls]; if (!C) continue;
    const cs = C.levels[cl.level - 1]?.cs || {}, L = cl.level, k = (n) => cl.cls + ":" + n;
    if (D.SYSTEM === "2024") { resources2024(c, D, cl, cs, L, k, m, add); continue; }
    switch (cl.cls) {
      case "barbarian": add(k("rage"), "Rage", cs.rage_count >= 999 ? 0 : cs.rage_count, "long", { note: `+${cs.rage_damage_bonus} damage` + (cs.rage_count >= 999 ? " · unlimited" : "") }); break;
      case "bard": add(k("inspiration"), "Bardic Inspiration", Math.max(1, m.cha), L >= 5 ? "short" : "long", { note: "d" + cs.bardic_inspiration_die }); break;
      case "cleric": add(k("channel"), "Channel Divinity", cs.channel_divinity_charges || 0, "short"); break;
      case "druid": if (L >= 2 && L < 20) add(k("wildshape"), "Wild Shape", 2, "short", { note: "max CR " + cs.wild_shape_max_cr }); break;
      case "fighter":
        add(k("secondwind"), "Second Wind", 1, "short", { note: "1d10+" + L });
        add(k("surge"), "Action Surge", cs.action_surges || 0, "short");
        add(k("indomitable"), "Indomitable", cs.indomitable_uses || 0, "long"); break;
      case "monk": add(k("ki"), "Ki", cs.ki_points || 0, "short"); break;
      case "paladin":
        add(k("layonhands"), "Lay on Hands", 5 * L, "long", { pool: true });
        add(k("divinesense"), "Divine Sense", 1 + Math.max(0, m.cha), "long");
        if (L >= 3) add(k("channel"), "Channel Divinity", 1, "short"); break;
      case "sorcerer": add(k("sorcery"), "Sorcery Points", cs.sorcery_points || 0, "long", { pool: true }); break;
      case "wizard": add(k("recovery"), "Arcane Recovery", 1, "long", { note: "recover " + Math.ceil(L / 2) + " levels of slots" }); break;
    }
  }
  features.filter((f) => f.uses?.max).forEach((f) => add("custom:" + f.id, f.name, +f.uses.max, f.uses.reset || "long"));
  return out;
}

// 2024 renames and re-times several class counters.
function resources2024(c, D, cl, cs, L, k, m, add) {
  switch (cl.cls) {
    case "barbarian": add(k("rage"), "Rage", cs.rage_count || 0, "long", { note: `+${cs.rage_damage_bonus} damage` }); break;
    case "bard":
      add(k("inspiration"), "Bardic Inspiration", Math.max(1, m.cha), L >= 5 ? "short" : "long", { note: "d" + cs.bardic_inspiration_die });
      if (L >= 5) add(k("songofrest"), "Song of Rest", 1, "long"); break;
    case "cleric": add(k("channel"), "Channel Divinity", cs.channel_divinity_charges || 0, "short"); break;
    case "druid": add(k("wildshape"), "Wild Shape", cs.wild_shape_uses || 0, "short"); break;
    case "fighter":
      add(k("secondwind"), "Second Wind", cs.second_wind_uses || 0, "short", { note: "1d10+" + L });
      add(k("surge"), "Action Surge", L >= 17 ? 2 : L >= 2 ? 1 : 0, "short");
      add(k("indomitable"), "Indomitable", L >= 17 ? 3 : L >= 13 ? 2 : L >= 9 ? 1 : 0, "long"); break;
    case "monk": add(k("focus"), "Focus Points", cs.focus_points || 0, "short"); break;
    case "paladin":
      add(k("layonhands"), "Lay on Hands", 5 * L, "long", { pool: true });
      add(k("channel"), "Channel Divinity", cs.channel_divinity_charges || 0, "short"); break;
    case "sorcerer": add(k("sorcery"), "Sorcery Points", cs.sorcery_points || 0, "long", { pool: true }); break;
    case "wizard": add(k("recovery"), "Arcane Recovery", 1, "long", { note: "recover " + Math.ceil(L / 2) + " levels of slots" }); break;
    case "warlock": if (L >= 5) add(k("cunning"), "Magical Cunning", 1, "long"); break;
  }
}

// ---------------------------------------------------------------- master derive
// Items whose bonuses the sheet knows by name, so an imported Ring of Protection counts
// without anyone typing +1 twice. Anything set on the item itself wins over these.
function sameName(a, b) {
  const n = (s) => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

export const ITEM_PRESETS = [
  [/^ring of protection$/i, { ac: 1, saves: 1, attune: true }],
  [/^cloak of protection$/i, { ac: 1, saves: 1, attune: true }],
  [/^bracers of defen[cs]e$/i, { ac: 2, attune: true, unarmoredOnly: true }],
  [/^ioun stone.*protection/i, { ac: 1, attune: true }],
  [/^(stone of good luck|luckstone)/i, { saves: 1, attune: true, note: "Also +1 to ability checks" }],
];
export function itemPreset(name) {
  const hit = ITEM_PRESETS.find(([re]) => re.test(String(name || "").trim()));
  return hit ? hit[1] : null;
}
export function withItemPreset(it) {
  const pre = itemPreset(it.name);
  if (!pre) return it;
  const out = { ...pre };
  Object.entries(it).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out;
}

export function derive(c, D) {
  const lvl = Math.max(1, totalLevel(c));
  const pb = profBonus(lvl);
  const bonuses = { ac: 0, acSet: 0, saves: 0, init: 0, speed: 0, hpPerLevel: 0, hpFlat: 0, spellAtk: 0, spellDC: 0, ...(c.bonuses || {}) };
  const ab = computeAbilities(c, D);
  const m = {}; ABIL.forEach((a) => (m[a] = mod(ab[a])));
  const race = findRace(c, D), sub = findSubrace(race, c);
  const features = collectFeatures(c, D);
  const hasF = (re) => features.some((f) => re.test(f.name));
  const clsLevel = (k) => (c.classes || []).find((x) => x.cls === k)?.level || 0;
  const subOf = (k) => { const x = (c.classes || []).find((y) => y.cls === k); return x ? findSubclass(D, k, x.subclass) : null; };
  const P = collectProfs(c, D, features);
  const warnings = [];

  // ---- armor & AC
  const armor = c.armor ? D.ARMOR.find((a) => a.name === c.armor) : null;
  const shieldOn = !!c.shield;
  const armorOk = !armor || P.armorProf(armor.cat);
  const shieldOk = !shieldOn || P.armorProf("shield");
  if (!armorOk) warnings.push(`Not proficient with ${armor.name}`);
  if (!shieldOk) warnings.push("Not proficient with shields");
  const strShort = armor && armor.str && ab.str < armor.str;
  const acOptions = [];
  if (armor) {
    const dexPart = armor.dex ? (armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex) : 0;
    acOptions.push({ label: armor.name, ac: armor.base + dexPart + (+c.armorMagic || 0) });
  } else {
    acOptions.push({ label: "Unarmored", ac: 10 + m.dex });
    if (clsLevel("barbarian")) acOptions.push({ label: "Unarmored Defense (Barbarian)", ac: 10 + m.dex + m.con });
    if (clsLevel("monk") && !shieldOn) acOptions.push({ label: "Unarmored Defense (Monk)", ac: 10 + m.dex + m.wis });
    if (hasF(/^Draconic Resilience$/)) acOptions.push({ label: "Draconic Resilience", ac: 13 + m.dex });
    if (c.flags?.mageArmor) acOptions.push({ label: "Mage Armor", ac: 13 + m.dex });
  }
  const bestAc = acOptions.reduce((b, o) => (o.ac > b.ac ? o : b), acOptions[0]);
  const defenseStyle = armor && (hasF(/^Fighting Style: Defense$/) || hasF(/^Defense$/));
  // Magic items that add to AC or saves. An item that needs attunement only counts once
  // you're attuned; Bracers of Defense and the like only count with no armor and no shield.
  const itemBonus = { ac: 0, saves: 0, acFrom: [], savesFrom: [] };
  (c.items || []).forEach((raw) => {
    const it = withItemPreset(raw);
    if (it.attune && !it.attuned) return;
    if (+it.ac && !(it.unarmoredOnly && (armor || shieldOn))) { itemBonus.ac += +it.ac; itemBonus.acFrom.push(it.name + " " + sgn(+it.ac)); }
    if (+it.saves) { itemBonus.saves += +it.saves; itemBonus.savesFrom.push(it.name + " " + sgn(+it.saves)); }
  });
  const acCalc = bestAc.ac + (shieldOn ? 2 + (+c.shieldMagic || 0) : 0) + (defenseStyle ? 1 : 0) + itemBonus.ac + (+bonuses.ac || 0);
  const ac = +bonuses.acSet || acCalc;
  const acBreakdown = +bonuses.acSet
    ? ["Set by hand"]
    : [bestAc.label + " " + bestAc.ac, shieldOn && "Shield +" + (2 + (+c.shieldMagic || 0)), defenseStyle && "Defense +1", ...itemBonus.acFrom, bonuses.ac && "Bonus " + sgn(+bonuses.ac)].filter(Boolean);

  // ---- roll modifiers
  const rm = rollModifiers(c, !armorOk || !shieldOk, D.SYSTEM);
  const d20Penalty = D.SYSTEM === "2024" ? 2 * (+c.exhaustion || 0) : 0;

  // ---- HP
  let hpMax = 0; const hitDice = {};
  (c.classes || []).forEach((cl, ci) => {
    const C = D.CLASSES[cl.cls]; if (!C) return;
    hitDice[C.hd] = (hitDice[C.hd] || 0) + cl.level;
    for (let i = 0; i < cl.level; i++) {
      const roll = cl.hp?.[i];
      const base = ci === 0 && i === 0 ? C.hd : roll != null ? +roll : Math.floor(C.hd / 2) + 1;
      hpMax += Math.max(1, base + m.con);
    }
  });
  if (hasF(/^Dwarven Toughness$/)) hpMax += lvl;
  if (hasF(/^Tough$/)) hpMax += 2 * lvl;
  if (hasF(/^Draconic Resilience$/)) hpMax += clsLevel("sorcerer");
  hpMax += (+bonuses.hpPerLevel || 0) * lvl + (+bonuses.hpFlat || 0);
  if (D.SYSTEM !== "2024" && c.exhaustion >= 4) hpMax = Math.floor(hpMax / 2);
  hpMax = Math.max(1, hpMax);
  const hitDiceList = Object.entries(hitDice).map(([die, total]) => ({ die: +die, total, used: Math.min(total, +(c.hitDiceUsed || {})[die] || 0) })).sort((a, b) => b.die - a.die);

  // ---- saves
  const saveProfs = new Set([...(D.CLASSES[c.classes?.[0]?.cls]?.saves || []), ...(c.extraSaves || [])]);
  const aura = clsLevel("paladin") >= 6 ? Math.max(1, m.cha) : 0;
  const saves = {};
  ABIL.forEach((a) => {
    const prof = saveProfs.has(a);
    saves[a] = { prof, mod: m[a] + (prof ? pb : 0) + aura + itemBonus.saves + (+bonuses.saves || 0) - d20Penalty, dis: rm.saves[a], autoFail: rm.autoFailStrDex && (a === "str" || a === "dex") };
  });

  // ---- skills
  const jack = clsLevel("bard") >= 2;
  const athlete = hasF(/^Remarkable Athlete$/);
  const expertise = new Set(c.expertise || []);
  const skills = {};
  D.SKILLS.forEach(([key, name, abil]) => {
    let mult = 0, why = "";
    if (P.skills.has(key)) mult = 1;
    if (mult && expertise.has(key)) { mult = 2; why = "Expertise"; }
    let extra = mult * pb;
    if (!mult && jack) { extra = Math.floor(pb / 2); why = "Jack of All Trades"; }
    if (!mult && athlete && ["str", "dex", "con"].includes(abil)) { extra = Math.max(extra, Math.ceil(pb / 2)); why = "Remarkable Athlete"; }
    const stealthArmor = key === "stealth" && armor?.stealthDis;
    skills[key] = {
      name, abil, prof: mult, mod: m[abil] + extra - d20Penalty, why, sources: P.skillSources[key] || [],
      dis: [...rm.checks.filter((x) => !/Str\/Dex/.test(x) || abil === "str" || abil === "dex"), ...(stealthArmor ? [armor.name] : [])],
    };
  });
  const passive = { perception: 10 + skills.perception.mod, investigation: 10 + skills.investigation.mod, insight: 10 + skills.insight.mod };
  if (hasF(/^Observant$/)) { passive.perception += 5; passive.investigation += 5; }

  // ---- initiative
  let init = m.dex + (+bonuses.init || 0) - d20Penalty;
  if (D.SYSTEM === "2024" && hasF(/^Alert$/)) init += pb;          // 2024 Alert adds the proficiency bonus
  if (jack) init += Math.floor(pb / 2); else if (athlete) init += Math.ceil(pb / 2);
  if (D.SYSTEM !== "2024" && hasF(/^Alert$/)) init += 5;

  // ---- speed
  let speed = (sub?.speed || race.speed || 30) + (+bonuses.speed || 0);
  const speedNotes = [];
  if (strShort && race.key !== "dwarf") { speed -= 10; speedNotes.push(`${armor.name} needs Str ${armor.str} (−10 ft)`); }
  const monkCs = D.CLASSES.monk.levels[clsLevel("monk") - 1]?.cs;
  const monkSpeed = monkCs?.unarmored_movement ?? monkCs?.unarmored_movement_bonus;
  if (monkSpeed && !armor && !shieldOn) { speed += monkSpeed; speedNotes.push("Unarmored Movement +" + monkSpeed); }
  if (clsLevel("barbarian") >= 5 && armor?.cat !== "heavy") { speed += 10; speedNotes.push("Fast Movement +10"); }
  if (D.SYSTEM === "2024") {
    if (c.exhaustion > 0) { speed = Math.max(0, speed - 5 * c.exhaustion); speedNotes.push(`Exhaustion ${c.exhaustion}: −${5 * c.exhaustion} ft`); }
  } else if (c.exhaustion >= 2) { speed = Math.floor(speed / 2); speedNotes.push("Exhaustion: halved"); }
  const co = c.conditions || {};
  if ((D.SYSTEM !== "2024" && c.exhaustion >= 5) || co.grappled || co.restrained || co.paralyzed || co.petrified || co.stunned || co.unconscious) { speed = 0; speedNotes.push("Speed 0"); }

  // ---- attacks
  const champ = subOf("fighter");
  const critRange = champ?.name === "Champion" ? (clsLevel("fighter") >= 15 ? 18 : clsLevel("fighter") >= 3 ? 19 : 20) : 20;
  const extraAttackN = Math.max(
    D.CLASSES.fighter.levels[clsLevel("fighter") - 1]?.cs?.extra_attacks || 0,
    hasF(/^Three Extra Attacks$/) ? 3 : hasF(/^Two Extra Attacks$/) ? 2 : hasF(/^Extra Attack/) ? 1 : 0,
  );
  const monkLevel = clsLevel("monk");
  const monkCsAll = monkLevel ? D.CLASSES.monk.levels[monkLevel - 1].cs : null;
  const martialDie = !monkCsAll ? null
    : monkCsAll.martial_arts || { dice_count: 1, dice_value: monkCsAll.martial_arts_die };
  const monkOk = monkLevel && !armor && !shieldOn;
  const raging = c.flags?.raging && clsLevel("barbarian");
  const rageBonus = raging ? D.CLASSES.barbarian.levels[clsLevel("barbarian") - 1].cs.rage_damage_bonus : 0;
  const style = (n) => hasF(new RegExp("^(Fighting Style: )?" + n + "$"));

  const buildAttack = (w) => {
    const base = w.base ? D.WEAPONS.find((x) => x.name === w.base) : null;
    const props = w.custom?.props || base?.props || [];
    const cat = w.custom?.cat || base?.cat || "simple";
    const ranged = w.custom?.ranged ?? base?.ranged ?? false;
    const isMonkWeapon = w.unarmed || props.includes("monk") || w.base === "Shortsword";
    let abil = ranged ? "dex" : "str";
    if (props.includes("finesse") || (monkOk && isMonkWeapon)) abil = m.dex > m.str ? "dex" : "str";
    if (w.ability) abil = w.ability;
    const proficient = w.unarmed || (w.proficient ?? P.weaponProf(base || { name: w.name, cat }));
    const magic = +w.magic || 0;
    let atk = m[abil] + (proficient ? pb : 0) + magic + (+w.atkBonus || 0) - d20Penalty;
    if (ranged && style("Archery")) atk += 2;
    let dice = w.custom?.dmg || base?.dmg || "1";
    if (w.twoHanded && base?.versatile) dice = base.versatile;
    if (w.unarmed) dice = "1";
    if (monkOk && isMonkWeapon && !w.twoHanded) {
      const md = martialDie.dice_count + "d" + martialDie.dice_value;
      const avg = (s) => { const x = /^(\d+)d(\d+)$/.exec(s); return x ? x[1] * (+x[2] + 1) / 2 : +s || 1; };
      if (avg(md) > avg(dice)) dice = md;
    }
    let dmg = magic + (+w.dmgBonus || 0);
    const abilDmg = w.offhand && !style("Two-Weapon Fighting") ? Math.min(0, m[abil]) : m[abil];
    dmg += abilDmg;
    const oneHandedMelee = !ranged && !props.includes("two-handed") && !w.twoHanded && !w.offhand;
    if (oneHandedMelee && style("Dueling")) dmg += 2;
    if (raging && abil === "str" && !ranged) dmg += rageBonus;
    const notes = [];
    if (!proficient) notes.push("not proficient");
    if (w.twoHanded && props.includes("two-handed") === false && base?.versatile) notes.push("two-handed");
    if (style("Great Weapon Fighting") && !ranged && (props.includes("two-handed") || w.twoHanded)) notes.push("reroll 1s and 2s");
    if (props.includes("heavy") && race.size === "Small") notes.push("disadvantage (heavy, Small)");
    if (w.offhand) notes.push("bonus action");
    const range = base?.range ? base.range.filter(Boolean).join("/") + " ft" : props.includes("reach") ? "10 ft" : "5 ft";
    const masteryName = D.SYSTEM === "2024" ? base?.mastery || "" : "";
    const masteryOn = masteryName && (c.masteries ? Object.values(c.masteries).some((list) => (list || []).includes(base?.name)) : false);
    return {
      id: w.id, name: w.name || base?.name || "Weapon", base: w.base, abil, proficient, atk,
      dice, dmg, dmgType: w.unarmed ? "bludgeoning" : w.custom?.type || base?.type || "", props, range, ranged,
      mastery: masteryName, masteryOn,
      critRange, dis: rm.attacks, notes,
    };
  };
  const attacks = [buildAttack({ id: "unarmed", name: "Unarmed strike", unarmed: true }), ...(c.weapons || []).map(buildAttack)];
  const attackExtras = [];
  if (extraAttackN) attackExtras.push(`${extraAttackN + 1} attacks per Attack action`);
  const rogueCs = D.CLASSES.rogue.levels[clsLevel("rogue") - 1]?.cs;
  if (rogueCs) attackExtras.push(`Sneak Attack ${rogueCs.sneak_attack.dice_count}d${rogueCs.sneak_attack.dice_value}`);
  const brutal = D.CLASSES.barbarian.levels[clsLevel("barbarian") - 1]?.cs?.brutal_critical_dice;
  if (brutal) attackExtras.push(`Brutal Critical +${brutal} die on crits`);
  if (monkLevel && martialDie?.dice_value) attackExtras.push(`Martial Arts d${martialDie.dice_value}`);
  if (critRange < 20) attackExtras.push(`Critical on ${critRange}–20`);

  // ---- spells
  const masteryLimit = D.SYSTEM === "2024"
    ? (c.classes || []).reduce((t, cl) => Math.max(t, D.CLASSES[cl.cls]?.levels[cl.level - 1]?.cs?.weapon_mastery || 0), 0)
    : 0;
  const masteryChosen = D.SYSTEM === "2024" ? [...new Set(Object.values(c.masteries || {}).flat().filter(Boolean))] : [];
  if (masteryChosen.length > masteryLimit) warnings.push(`${masteryChosen.length} weapon masteries chosen, ${masteryLimit} allowed`);

  const sp = spellcasting(c, D, m, pb, bonuses);
  const cantripDice = lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1;
  const customSpells = c.customSpells || [];
  const mySpells = (c.spells || []).map((s) => {
    const own = customSpells.find((x) => x.name === s.name);
    // Bundled first, then the homebrew library (folded into D.SPELLS), then the character's own
    // entry. A library spell with text beats an imported one that only has a name and page.
    const data = D.SPELLS.find((x) => x.name === s.name) || D.SPELLS.find((x) => sameName(x.name, s.name))
      || (own ? { ...own, custom: true } : undefined);
    return { ...s, data, level: data?.level ?? s.level ?? 0 };
  });
  sp.casters.forEach((k) => {
    const mine = mySpells.filter((s) => s.cls === k.cls);
    k.cantripsChosen = mine.filter((s) => s.level === 0).length;
    k.leveledChosen = mine.filter((s) => s.level > 0).length;
    k.preparedCount = mine.filter((s) => s.level > 0 && (s.prepared || s.always)).filter((s) => !s.always).length;
    if (k.cantrips != null && k.cantripsChosen > k.cantrips) warnings.push(`${k.name}: ${k.cantripsChosen}/${k.cantrips} cantrips`);
    if (k.known != null && k.leveledChosen > k.known) warnings.push(`${k.name}: ${k.leveledChosen}/${k.known} spells known`);
    if (k.prepared != null && k.preparedCount > k.prepared) warnings.push(`${k.name}: ${k.preparedCount}/${k.prepared} prepared`);
  });
  const slotState = sp.slots.map((max, i) => ({ level: i + 1, max, used: Math.min(max, +(c.slotsUsed || {})[i + 1] || 0) })).filter((s) => s.max > 0);
  // subclass bonus spells (domain, oath, circle, patron) — always prepared, don't count against limits
  const alwaysPrepared = [];
  for (const cl of c.classes || []) {
    const sc = findSubclass(D, cl.cls, cl.subclass);
    (sc?.spells || []).forEach((s) => { if (s.level <= cl.level) alwaysPrepared.push({ name: s.name, cls: cl.cls, from: sc.name }); });
  }

  // ---- carrying & attunement
  const itemWt = (c.items || []).reduce((t, i) => t + (+i.wt || 0) * (+i.qty || 1), 0);
  const weaponWt = (c.weapons || []).reduce((t, w) => t + (D.WEAPONS.find((x) => x.name === w.base)?.wt || 0), 0);
  const coinCount = Object.values(c.coins || {}).reduce((t, n) => t + (+n || 0), 0);
  const coinWt = coinCount / 50; // 50 coins to the pound
  const carried = Math.round((itemWt + weaponWt + coinWt + (armor?.wt || 0) + (shieldOn ? 6 : 0)) * 100) / 100;
  const sizeMult = race.size === "Small" ? 1 : 1; // Small creatures use the same capacity in 2014 RAW
  const capacity = ab.str * 15 * sizeMult;
  const attuned = (c.items || []).filter((i) => i.attuned).length;
  if (attuned > 3) warnings.push(`Attuned to ${attuned} items (max 3)`);
  if (carried > capacity) warnings.push(`Carrying ${carried} lb (capacity ${capacity})`);

  // ---- multiclass prerequisite check (informational)
  if ((c.classes || []).length > 1) (c.classes || []).forEach((cl) => {
    const ok = multiclassOk(D, cl.cls, ab);
    if (!ok) warnings.push(`${D.CLASSES[cl.cls].name} multiclass prerequisites not met`);
  });

  const hp = c.hp == null ? hpMax : Math.min(c.hp, hpMax);
  return {
    level: lvl, pb, ab, m, race, subrace: sub, background: findBg(c, D),
    classes: (c.classes || []).map((cl) => ({ ...cl, data: D.CLASSES[cl.cls], sub: findSubclass(D, cl.cls, cl.subclass) })),
    classLine: (c.classes || []).map((cl) => `${D.CLASSES[cl.cls]?.name || cl.cls} ${cl.level}`).join(" / "),
    features, profs: P.list, weaponProf: P.weaponProf,
    hp, hpMax, tempHp: +c.tempHp || 0, hitDice: hitDiceList,
    ac, acBreakdown, acOptions, armor, shield: shieldOn,
    saves, skills, passive, init, speed, speedNotes,
    attacks, attackExtras, critRange, extraAttacks: extraAttackN,
    spell: { ...sp, slotState, cantripDice, spells: mySpells, alwaysPrepared },
    resources: resources(c, D, m, features),
    system: D.SYSTEM || "2014", masteryLimit, masteryChosen, d20Penalty,
    carried, capacity, attuned, coinWt, acCalc, itemBonus,
    rollMods: rm, conditionsActive: Object.keys(co).filter((k) => co[k]), exhaustion: +c.exhaustion || 0,
    concentrating: c.concentration, warnings,
    nextLevelXp: XP_TABLE[lvl] ?? null, xpLevel: XP_TABLE.filter((x) => (c.xp || 0) >= x).length,
  };
}

export function multiclassOk(D, cls, ab) {
  const p = D.CLASSES[cls]?.mcPrereq; if (!p) return true;
  if (p.all) return p.all.every(([a, n]) => ab[a] >= n);
  if (p.any) return p.any.some(([a, n]) => ab[a] >= n);
  return true;
}

// ---------------------------------------------------------------- level up
// Describes what gaining one level in clsKey involves. The UI walks these steps, collects answers,
// then calls applyLevelUp.
export function levelUpPlan(c, D, clsKey) {
  const C = D.CLASSES[clsKey]; if (!C) return null;
  const existing = (c.classes || []).find((x) => x.cls === clsKey);
  const newLevel = (existing?.level || 0) + 1;
  const isNewClass = !existing;
  const ab = computeAbilities(c, D);
  const steps = [];
  if (totalLevel(c) >= 20) return { error: "Already level 20" };
  if (newLevel > 20) return { error: "Class already at 20" };
  if (isNewClass && (c.classes || []).length) {
    const okNew = multiclassOk(D, clsKey, ab), okOld = (c.classes || []).every((cl) => multiclassOk(D, cl.cls, ab));
    steps.push({ kind: "prereq", ok: okNew && okOld, detail: fmtPrereq(C.mcPrereq) });
    if (C.mcProfs?.length) steps.push({ kind: "info", label: "Proficiencies gained", detail: C.mcProfs.join(", ") });
    if (C.mcSkills) steps.push({ kind: "skills", n: C.mcSkills, from: C.skillFrom, label: `Choose ${C.mcSkills} ${C.name} skill` });
  }
  if (!(c.classes || []).length) steps.push({ kind: "skills", n: C.skillChoose, from: C.skillFrom, label: `Choose ${C.skillChoose} skills` });

  const isFirstCharLevel = !(c.classes || []).length;
  steps.push({ kind: "hp", die: C.hd, fixed: isFirstCharLevel ? C.hd : null, average: Math.floor(C.hd / 2) + 1 });

  const row = C.levels[newLevel - 1], prev = C.levels[newLevel - 2];
  const feats = C.features.filter((f) => !f.parent && f.level === newLevel && !/^Ability Score Improvement$/.test(f.name) && !/ feature$/.test(f.name));
  if (feats.length) steps.push({ kind: "features", list: feats });
  // options (fighting style, invocations are handled as "choose from")
  const parents = new Set(C.features.filter((f) => f.parent).map((f) => f.parent));
  feats.filter((f) => parents.has(f.name) && !(clsKey === "warlock" && f.name === "Eldritch Invocations")).forEach((f) => {
    steps.push({ kind: "option", key: clsKey + ":" + f.name, label: f.name, n: 1, options: C.features.filter((o) => o.parent === f.name && o.level <= newLevel) });
  });
  if (D.SYSTEM === "2024" && feats.some((f) => f.name === "Fighting Style")) {
    steps.push({ kind: "option", key: clsKey + ":Fighting Style", label: "Fighting Style", n: 1,
      options: D.FEATS.filter((x) => x.type === "fighting-style").map((x) => ({ name: x.name, desc: x.desc })) });
  }
  if (D.SYSTEM === "2024") {
    const now = row?.cs?.weapon_mastery || 0, before = prev?.cs?.weapon_mastery || 0;
    if (now > before) steps.push({ kind: "mastery", cls: clsKey, n: now, gained: now - before, label: `Weapon Mastery — choose ${now} weapons` });
  }
  if (feats.some((f) => /^Expertise/.test(f.name))) steps.push({ kind: "expertise", n: 2, label: "Choose 2 skills for Expertise" });
  if (newLevel >= C.subclassLevel && !existing?.subclass) {
    steps.push({ kind: "subclass", label: C.subclassLabel || "Subclass", options: D.SUBCLASSES.filter((s) => s.cls === clsKey) });
  }
  if (existing?.subclass) {
    const sc = findSubclass(D, clsKey, existing.subclass);
    const sf = (sc?.features || []).filter((f) => f.level === newLevel || (f.levels || []).includes(newLevel));
    if (sf.length) steps.push({ kind: "features", from: sc.name, list: sf });
  }
  if (row && prev && row.asi > prev.asi) steps.push({ kind: "asi", classLevel: newLevel, label: "Ability Score Improvement or feat" });
  // warlock invocations count changes
  if (clsKey === "warlock" && row.cs.invocations_known > (prev?.cs?.invocations_known || 0)) {
    steps.push({ kind: "option", key: "warlock:Eldritch Invocations", label: "Eldritch Invocations", n: row.cs.invocations_known - (prev?.cs?.invocations_known || 0),
      options: C.features.filter((o) => o.parent === "Eldritch Invocations" && o.level <= newLevel), cumulative: true });
  }
  // spell count changes
  const dc = (k) => (row?.[k] ?? 0) - (prev?.[k] ?? 0);
  if (row?.cantrips != null && dc("cantrips") > 0) steps.push({ kind: "cantrips", n: dc("cantrips") });
  if (row?.known != null && dc("known") > 0) steps.push({ kind: "spells", n: dc("known") });
  const prepNow = row?.prepared ?? null, prepBefore = prev?.prepared ?? null;
  if (prepNow != null && prepNow !== prepBefore) steps.push({ kind: "spells", n: prepNow - (prepBefore || 0), label: `Prepared spells (${prepNow} total)` });
  else if (C.prep === "prepared" && D.SYSTEM !== "2024") steps.push({ kind: "info", label: "Prepared spells", detail: "Your prepared spell limit increases; adjust prepared spells after a long rest." });
  if (row?.slots && prev?.slots && row.slots.some((n, i) => n > (prev.slots[i] || 0))) steps.push({ kind: "info", label: "Spell slots", detail: "New spell slots available" });
  return { cls: clsKey, className: C.name, newLevel, isNewClass, pb: profBonus(totalLevel(c) + 1), steps };
}

const fmtPrereq = (p) => (!p ? "" : p.all ? p.all.map(([a, n]) => `${a.toUpperCase()} ${n}`).join(" and ") : p.any.map(([a, n]) => `${a.toUpperCase()} ${n}`).join(" or "));

// answers: { hp: number|null (null = average), skills: [], options: {key: [names]}, expertise: [],
//            subclass: key, asi: {type, picks, feat}, spells: [names], cantrips: [names] }
export function applyLevelUp(c, D, clsKey, answers = {}) {
  const plan = levelUpPlan(c, D, clsKey);
  if (!plan || plan.error) return c;
  const classes = (c.classes || []).map((x) => ({ ...x, hp: [...(x.hp || [])], asi: { ...(x.asi || {}) }, skills: [...(x.skills || [])] }));
  let cl = classes.find((x) => x.cls === clsKey);
  if (!cl) { cl = { cls: clsKey, level: 0, subclass: "", hp: [], skills: [], asi: {} }; classes.push(cl); }
  cl.level = plan.newLevel;
  cl.hp[plan.newLevel - 1] = answers.hp ?? null;
  if (answers.skills) cl.skills = [...cl.skills, ...answers.skills];
  if (answers.subclass) cl.subclass = answers.subclass;
  if (answers.asi) cl.asi[plan.newLevel] = answers.asi;
  const masteries = { ...(c.masteries || {}) };
  if (answers.masteries) masteries[clsKey] = answers.masteries;
  const choices = { ...(c.choices || {}) };
  Object.entries(answers.options || {}).forEach(([k, v]) => {
    const step = plan.steps.find((s) => s.key === k);
    choices[k] = step?.cumulative ? [...[].concat(choices[k] || []), ...[].concat(v)] : v;
  });
  const spells = [...(c.spells || []), ...[...(answers.cantrips || []), ...(answers.spells || [])].map((name) => ({ name, cls: clsKey, prepared: true }))];
  const next = { ...c, classes, choices, spells, masteries, expertise: [...(c.expertise || []), ...(answers.expertise || [])] };
  // keep current HP in step with the new maximum
  if (c.hp != null) {
    const before = derive(c, D).hpMax, after = derive(next, D).hpMax;
    next.hp = Math.max(0, c.hp + (after - before));
  }
  return next;
}

// ---------------------------------------------------------------- play-state helpers (return patches)
export function applyDamage(c, dv, amount, { crit = false } = {}) {
  let n = Math.max(0, Math.floor(+amount || 0));
  let temp = +c.tempHp || 0, hp = c.hp == null ? dv.hpMax : c.hp;
  const events = [];
  const absorbed = Math.min(temp, n); temp -= absorbed; n -= absorbed;
  if (c.concentration && amount > 0) events.push({ type: "concentration", dc: Math.max(10, Math.floor(amount / 2)), spell: c.concentration });
  const patch = { tempHp: temp };
  if (hp === 0 && n > 0) {
    if (n >= dv.hpMax) return { ...patch, dead: true, events: [...events, { type: "dead", why: "massive damage" }] };
    const f = Math.min(3, (c.deathSaves?.f || 0) + (crit ? 2 : 1));
    return { ...patch, deathSaves: { ...(c.deathSaves || { s: 0 }), f }, dead: f >= 3, events: [...events, { type: "deathFail", n: crit ? 2 : 1 }] };
  }
  const left = hp - n;
  if (left <= 0) {
    if (-left >= dv.hpMax) return { ...patch, hp: 0, dead: true, events: [...events, { type: "dead", why: "massive damage" }] };
    return { ...patch, hp: 0, deathSaves: { s: 0, f: 0 }, concentration: null, events: [...events, { type: "down" }] };
  }
  return { ...patch, hp: left, events };
}

export function applyHeal(c, dv, amount) {
  const hp = c.hp == null ? dv.hpMax : c.hp;
  if (c.dead) return {};
  return { hp: Math.min(dv.hpMax, hp + Math.max(0, Math.floor(+amount || 0))), deathSaves: { s: 0, f: 0 } };
}

export const setTempHp = (c, amount) => ({ tempHp: Math.max(+c.tempHp || 0, Math.floor(+amount || 0)) }); // temp HP doesn't stack

// roll: the natural d20
export function deathSave(c, roll) {
  const ds = { s: 0, f: 0, ...(c.deathSaves || {}) };
  if (roll === 20) return { hp: 1, deathSaves: { s: 0, f: 0 }, events: [{ type: "revive" }] };
  if (roll === 1) ds.f += 2; else if (roll >= 10) ds.s += 1; else ds.f += 1;
  if (ds.f >= 3) return { deathSaves: { ...ds, f: 3 }, dead: true, events: [{ type: "dead" }] };
  if (ds.s >= 3) return { deathSaves: { s: 3, f: ds.f }, events: [{ type: "stable" }] };
  return { deathSaves: ds };
}

// spend: { [die]: count } hit dice to spend; rolls: array of the rolled values (UI rolls them)
export function shortRest(c, dv, { spend = {}, rolls = [] } = {}) {
  const used = { ...(c.hitDiceUsed || {}) };
  let healed = 0;
  Object.entries(spend).forEach(([die, n]) => {
    const pool = dv.hitDice.find((h) => h.die === +die); if (!pool) return;
    const k = Math.min(+n, pool.total - (used[die] || 0));
    used[die] = (used[die] || 0) + k;
  });
  rolls.forEach((r) => (healed += Math.max(0, +r + dv.m.con)));
  const resourcesUsed = { ...(c.resourcesUsed || {}) };
  dv.resources.filter((r) => r.reset === "short").forEach((r) => delete resourcesUsed[r.key]);
  const hp = Math.min(dv.hpMax, (c.hp == null ? dv.hpMax : c.hp) + healed);
  return { hitDiceUsed: used, resourcesUsed, pactUsed: 0, hp };
}

export function longRest(c, dv) {
  const totalDice = dv.hitDice.reduce((t, h) => t + h.total, 0);
  let regain = Math.max(1, Math.floor(totalDice / 2));
  const used = { ...(c.hitDiceUsed || {}) };
  // regain larger dice first
  dv.hitDice.forEach((h) => { const k = Math.min(regain, used[h.die] || 0); used[h.die] = (used[h.die] || 0) - k; regain -= k; if (!used[h.die]) delete used[h.die]; });
  const resourcesUsed = { ...(c.resourcesUsed || {}) };
  dv.resources.forEach((r) => delete resourcesUsed[r.key]);
  return {
    hp: dv.hpMax, tempHp: 0, hitDiceUsed: used, slotsUsed: {}, pactUsed: 0, arcanumUsed: {}, resourcesUsed,
    deathSaves: { s: 0, f: 0 }, exhaustion: Math.max(0, (+c.exhaustion || 0) - 1), flags: { ...(c.flags || {}), raging: false },
  };
}

// ---------------------------------------------------------------- misc helpers for the UI
export function spellListFor(D, listKey, maxLevel = 9) {
  return D.SPELLS.filter((s) => s.classes.includes(listKey) && s.level <= maxLevel);
}

// Parses "Increase your Wisdom score by 1" style half-feat text → allowed abilities
export function featAbilityOptions(feat) {
  const t = lc(feat?.desc);
  const m = /increase your (\w+)(?:,? or (\w+))?(?:,? or (\w+))? score by 1/.exec(t);
  if (!m) return /increase one ability score of your choice by 1/.test(t) ? ABIL : [];
  const map = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
  return [m[1], m[2], m[3]].filter(Boolean).map((w) => map[w]).filter(Boolean);
}

export function rollExpr(expr, rng = Math.random) {
  // "2d6+3", "1d20", "4d8-1"
  const rolls = []; let total = 0;
  String(expr).replace(/\s+/g, "").split(/(?=[+-])/).forEach((part) => {
    const x = /^([+-]?)(\d*)d(\d+)$/.exec(part);
    if (x) {
      const sign = x[1] === "-" ? -1 : 1, n = +(x[2] || 1), die = +x[3];
      for (let i = 0; i < n; i++) { const r = 1 + Math.floor(rng() * die); rolls.push(r * sign); total += r * sign; }
    } else if (part) total += +part || 0;
  });
  return { total, rolls };
}

export { uid };


// ---------------------------------------------------------------- casting
// Where a spell can be cast from right now: each unspent slot at or above its level, the
// pact slot, a Mystic Arcanum, or as a ritual. Cantrips are always free.
export function castOptions(c, dv, spell) {
  const lvl = spell.level || 0;
  const d = spell.data || {};
  if (lvl === 0) return [{ kind: "free", label: "Cast" }];
  const out = [];
  dv.spell.slotState.forEach((s) => {
    if (s.level >= lvl && s.used < s.max) out.push({ kind: "slot", level: s.level, label: s.level === lvl ? `${ordinal(s.level)}-level slot` : `Upcast · ${ordinal(s.level)} slot`, left: s.max - s.used });
  });
  const pact = dv.spell.pact;
  if (pact) {
    // Pact slots cast any spell you know of their level or lower; an arcanum is warlock-only.
    if (lvl <= pact.level && (+c.pactUsed || 0) < pact.count) out.push({ kind: "pact", level: pact.level, label: `Pact slot (${ordinal(pact.level)})`, left: pact.count - (+c.pactUsed || 0) });
    if (spell.cls === pact.cls && (pact.arcanum || []).includes(lvl) && !(c.arcanumUsed || {})[lvl]) out.push({ kind: "arcanum", level: lvl, label: `Mystic Arcanum (${ordinal(lvl)})`, left: 1 });
  }
  if (d.ritual) out.push({ kind: "ritual", level: lvl, label: "As a ritual (+10 minutes, no slot)" });
  return out;
}

// Spend what casting costs. Returns a patch for the character plus events the sheet can
// announce: a slot gone, concentration started, or concentration on something else dropped.
export function castSpell(c, dv, spell, how) {
  const events = [];
  const patch = {};
  const opts = castOptions(c, dv, spell);
  const ok = opts.find((o) => o.kind === how.kind && (o.level == null || how.level == null || o.level === how.level));
  if (!ok) return { patch: {}, events: [{ type: "unavailable" }] };
  if (how.kind === "slot") patch.slotsUsed = { ...(c.slotsUsed || {}), [how.level]: (+(c.slotsUsed || {})[how.level] || 0) + 1 };
  if (how.kind === "pact") patch.pactUsed = (+c.pactUsed || 0) + 1;
  if (how.kind === "arcanum") patch.arcanumUsed = { ...(c.arcanumUsed || {}), [how.level]: 1 };
  if (spell.data?.conc) {
    if (c.concentration && c.concentration !== spell.name) events.push({ type: "dropped", spell: c.concentration });
    patch.concentration = spell.name;
    events.push({ type: "concentrating", spell: spell.name });
  }
  return { patch, events, level: how.level ?? spell.level };
}

// The dice a spell rolls, read from its text: the first NdM, scaled for cantrips by character
// level, and for leveled spells by "+XdY for each slot level above N". Returns null when the
// text has no dice. It's a reading of the description, so the button shows what it will roll.
export function spellDice(spell, slotLevel, charLevel) {
  const d = spell.data || {};
  const text = String(d.desc || "");
  const m = /(\d+)d(\d+)/.exec(text);
  if (!m) return null;
  let n = +m[1]; const die = +m[2];
  const lvl = spell.level || 0;
  if (lvl === 0) {
    const tier = charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
    if (/(damage|healing) (increases|scales)[^.]*(levels? 5\b|5th level)/i.test(text + " " + (d.higher || ""))) n *= tier;
    return `${n}d${die}`;
  }
  const up = /(\d+)d(\d+)\s+for each (?:spell )?slot level above\s+(\w+)/i.exec((d.higher || "") + " " + text);
  if (up && +up[2] === die && slotLevel > lvl) n += +up[1] * (slotLevel - lvl);
  return `${n}d${die}`;
}

// What the spell asks for, read from its text: an attack roll, a saving throw (and which), or neither.
export function spellCheck(spell) {
  const t = String(spell.data?.desc || "");
  if (/(ranged|melee) spell attack|make a spell attack|spell attack roll/i.test(t)) return { kind: "attack" };
  const sv = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(t);
  if (sv) return { kind: "save", ability: sv[1].slice(0, 3).toLowerCase() };
  if (spell.data?.save) return { kind: "save", text: spell.data.save };
  return null;
}

function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
