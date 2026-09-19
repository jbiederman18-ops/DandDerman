// ddb-import.js — read a character PDF exported from D&D Beyond into this app.
//
// The export is a filled PDF form: every value sits in a named widget (CharacterName, STR,
// spellName0…). We read the widgets directly rather than through an AcroForm, because the
// export has no /AcroForm entry in its catalog.
//
// Nothing from a rulebook is bundled here. What the sheet doesn't spell out — a spell's text,
// a subclass's features — is kept as the character's own entry, with the book and page the
// export cites, so the player can read it in the book they own.

import * as E from "./dnd5e-engine.js";

const ABIL = E.ABIL;

// ---------------------------------------------------------------- reading the PDF
function decodeString(obj) {
  // pdf-lib mis-decodes hex strings containing whitespace, so decode from the raw token.
  const raw = obj.toString();
  if (raw.startsWith("<")) {
    const hex = raw.replace(/[^0-9a-fA-F]/g, "");
    const b = Uint8Array.from((hex.match(/../g) || []).map((h) => parseInt(h, 16)));
    return b[0] === 0xfe && b[1] === 0xff ? new TextDecoder("utf-16be").decode(b.slice(2)) : new TextDecoder("latin1").decode(b);
  }
  const bytes = obj.asBytes ? obj.asBytes() : null;
  if (!bytes) return String(raw);
  return bytes[0] === 0xfe && bytes[1] === 0xff
    ? new TextDecoder("utf-16be").decode(bytes.slice(2))
    : new TextDecoder("utf8").decode(bytes);
}

// Returns { name: {value, page, y} } for every filled widget in the document.
export async function readPdfFields(bytes, PDFLib) {
  const { PDFDocument, PDFName } = PDFLib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const fields = {};
  doc.getPages().forEach((page, pi) => {
    const annots = page.node.Annots();
    if (!annots) return;
    annots.asArray().forEach((ref) => {
      const w = page.doc.context.lookup(ref);
      if (!w || !w.lookup) return;
      const T = w.lookup(PDFName.of("T")), V = w.lookup(PDFName.of("V"));
      if (!T || !V) return;
      const name = decodeString(T).trim();
      const value = decodeString(V);
      if (!name || !String(value).trim()) return;
      const rect = w.lookup(PDFName.of("Rect"));
      const y = rect ? rect.asArray()[1].asNumber() : 0;
      if (!fields[name]) fields[name] = { value: String(value), page: pi, y };
    });
  });
  return fields;
}

// ---------------------------------------------------------------- small helpers
const val = (f, k) => (f[k] ? f[k].value.trim() : "");
const num = (f, k) => { const n = parseInt(String(val(f, k)).replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const titleOf = (s) => s.replace(/,\s*\+\d+$/, "").replace(/\s*\+\d+$/, "").trim();
const magicPlus = (s) => { const m = /\+(\d)\b/.exec(s); return m ? +m[1] : 0; };

const SKILL_FIELD = {
  Acrobatics: "acrobatics", Animal: "animal-handling", Arcana: "arcana", Athletics: "athletics",
  Deception: "deception", History: "history", Insight: "insight", Intimidation: "intimidation",
  Investigation: "investigation", Medicine: "medicine", Nature: "nature", Perception: "perception",
  Performance: "performance", Persuasion: "persuasion", Religion: "religion",
  SleightofHand: "sleight-of-hand", Stealth: "stealth", Survival: "survival",
};
const SAVE_FIELD = { StrProf: "str", DexProf: "dex", ConProf: "con", IntProf: "int", WisProf: "wis", ChaProf: "cha" };

// Features come through as "* Name • Source page" followed by the text.
function parseFeatureBlocks(text) {
  const out = [];
  let current = null, section = "";
  for (const line of String(text).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const sec = /^===\s*(.+?)\s*===$/.exec(t);
    if (sec) { section = sec[1].trim(); continue; }
    const head = /^\*\s*(.+?)\s*•\s*(.*)$/.exec(t);
    if (head) {
      current = { name: head[1], source: (head[2] || "").trim(), section, desc: "", uses: null };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const uses = /^\|\s*(.+?)\s*[:•]\s*(\d+)\s*\/\s*(Long|Short) Rest/i.exec(t) || /^\|\s*(\d+)\s*\/\s*(Long|Short) Rest/i.exec(t);
    if (uses) {
      current.uses = uses.length === 4
        ? { max: +uses[2], reset: uses[3].toLowerCase(), label: uses[1] }
        : { max: +uses[1], reset: uses[2].toLowerCase() };
      continue;
    }
    const sub = /^\|\s*(.+)$/.exec(t);          // "| Wild/Shadow Magic" — a chosen option
    if (sub) { current.choice = sub[1]; continue; }
    current.desc += (current.desc ? "\n" : "") + t;
  }
  return out;
}

const SPELL_TIME = { "1A": "1 action", "1BA": "1 bonus action", "1R": "1 reaction" };

function parseSpells(f) {
  // Section headers ("=== 1st LEVEL ===") sit above their spells on the page, so match by position.
  const headers = Object.keys(f).filter((k) => /^spellHeader\d+$/.test(k))
    .map((k) => ({ y: f[k].y, page: f[k].page, level: /cantrip/i.test(f[k].value) ? 0 : (parseInt(f[k].value.replace(/\D/g, ""), 10) || 0) }));
  const spells = [];
  Object.keys(f).filter((k) => /^spellName\d+$/.test(k)).forEach((k) => {
    const i = k.replace("spellName", "");
    const at = f[k];
    const above = headers.filter((h) => h.page === at.page && h.y >= at.y - 2).sort((a, b) => a.y - b.y)[0];
    const time = val(f, "spellCastingTime" + i);
    spells.push({
      name: at.value.trim(), level: above ? above.level : 0,
      source: val(f, "spellSource" + i), prepared: val(f, "spellPrepared" + i).toUpperCase() === "P",
      saveHit: val(f, "spellSaveHit" + i), time: SPELL_TIME[time] || time, range: val(f, "spellRange" + i),
      comp: val(f, "spellComponents" + i), dur: val(f, "spellDuration" + i), page: val(f, "spellPage" + i),
      notes: val(f, "spellNotes" + i),
    });
  });
  return spells;
}

function parseEquipment(f) {
  const items = [];
  const attuned = new Set();
  Object.keys(f).filter((k) => /^Attuned Name\d+$/.test(k)).forEach((k) => attuned.add(norm(f[k].value)));
  Object.keys(f).filter((k) => /^Eq Name\d+$/.test(k)).forEach((k) => {
    const i = k.replace("Eq Name", "");
    const name = f[k].value.trim();
    const wt = parseFloat(val(f, "Eq Weight" + i).replace(/[^0-9.]/g, ""));
    items.push({ id: E.uid(), name, qty: num(f, "Eq Qty" + i) || 1, wt: Number.isFinite(wt) ? wt : 0, attuned: attuned.has(norm(name)) });
  });
  return items;
}

function parseWeapons(f, D) {
  const out = [];
  Object.keys(f).filter((k) => /^Wpn Name( \d+)?$/.test(k)).forEach((k) => {
    const suffix = k.replace("Wpn Name", "").trim();      // "" for the first row, "2".."6" after
    const n = suffix || "1";
    const name = f[k].value.trim();
    if (/^unarmed strike$/i.test(name)) return;           // the app always shows this one
    const dmg = val(f, `Wpn${n} Damage`) || val(f, `Wpn${n} Damage `);
    const notes = val(f, `Wpn Notes ${n}`);
    const base = D.WEAPONS.find((w) => norm(w.name) === norm(titleOf(name)));
    const dice = /(\d+d\d+)/.exec(dmg);
    const type = /\d\s+([A-Za-z]+)\s*$/.exec(dmg);
    out.push({
      id: E.uid(), name, base: base ? base.name : null, magic: magicPlus(name),
      custom: base ? undefined : { dmg: dice ? dice[1] : "1d4", type: (type ? type[1] : "").toLowerCase(), props: [], cat: /martial/i.test(notes) ? "martial" : "simple", ranged: /range/i.test(notes) && !/thrown/i.test(notes) },
      notes, atkFromPdf: num(f, `Wpn${n} AtkBonus`) ?? num(f, `Wpn${n} AtkBonus `),
    });
  });
  return out;
}

// ---------------------------------------------------------------- the import itself
export function fieldsToCharacter(f, D, system = "2024") {
  const c = E.newChar(val(f, "CharacterName") || "Imported character", system);
  const report = { matched: [], custom: [], adjusted: [], review: [] };

  c.player = val(f, "PLAYER NAME");
  c.xp = num(f, "EXPERIENCE POINTS") || 0;

  // ---- classes: "Sorcerer 6" or "Fighter 5 / Wizard 2"
  const classes = [];
  val(f, "CLASS  LEVEL").split("/").forEach((part) => {
    const m = /^(.*?)\s+(\d+)\s*$/.exec(part.trim());
    if (!m) return;
    const label = m[1].replace(/\(.*?\)/g, "").trim();     // "Sorcerer (Wild Magic) 6" → "Sorcerer"
    const key = Object.keys(D.CLASSES).find((k) => norm(D.CLASSES[k].name) === norm(label));
    if (!key) { report.review.push(`Class "${part.trim()}" isn't one of the twelve classes — set it by hand.`); return; }
    classes.push({ cls: key, level: +m[2], subclass: "", hp: [], skills: [], asi: {} });
  });
  if (classes.length) c.classes = classes;

  // ---- ability scores. The export prints final scores, so they go in as-is with no racial
  // bonuses on top; the race below is imported without ability increases to match.
  c.abilityMethod = "manual";
  ABIL.forEach((a) => {
    const v = num(f, a.toUpperCase());
    if (v != null) c.base[a] = v;
  });

  // ---- race and background: match a bundled one by name, otherwise keep what the sheet says
  const raceName = val(f, "RACE");
  const race = D.RACES.find((r) => norm(r.name) === norm(raceName))
    || D.RACES.flatMap((r) => r.subraces.map((s) => ({ r, s }))).find((x) => norm(x.s.name) === norm(raceName));
  if (race?.key) { c.race = race.key; report.matched.push(`Race: ${race.name}`); }
  else if (race?.s) { c.race = race.r.key; c.subrace = race.s.key; report.matched.push(`Race: ${race.s.name}`); }
  else {
    c.race = "__custom";
    c.customRace = { name: raceName || "Unknown", speed: parseInt(val(f, "Speed"), 10) || 30, size: "Medium", asi: {}, traits: [], languages: "" };
    report.custom.push(`Race "${raceName}" isn't in the bundled books — kept as a custom race.`);
  }
  // species/background bonuses stay off, since the printed scores already include them
  if (race) report.review.push(D.SYSTEM === "2024"
    ? "Ability scores came in as printed. If you set your background's increases on the Build tab, lower the base scores to match."
    : "Ability scores came in as printed. If you re-pick your race's bonuses, lower the base scores to match.");

  const bgName = val(f, "BACKGROUND");
  const bg = D.BACKGROUNDS.find((b) => norm(b.name) === norm(bgName));
  if (bg) { c.background = bg.key; report.matched.push(`Background: ${bg.name}`); }
  else {
    c.background = "__custom";
    c.customBackground = { name: bgName || "Unknown" };
    report.custom.push(`Background "${bgName}" isn't in the bundled books — kept as a custom background.`);
  }

  // ---- skill and save proficiencies, straight from the sheet's markers
  const skills = [];
  Object.entries(SKILL_FIELD).forEach(([field, key]) => {
    const marker = val(f, field + "Prof");
    if (marker) skills.push(key);
  });
  c.extraSkills = skills;
  const saves = [];
  Object.entries(SAVE_FIELD).forEach(([field, a]) => { if (val(f, field)) saves.push(a); });
  if (saves.length) c.extraSaves = saves;

  // ---- hit points, hit dice, equipment, coins
  const maxHp = num(f, "MaxHP");
  c.hp = num(f, "CurrentHP") ?? maxHp;
  c.items = parseEquipment(f);
  c.weapons = parseWeapons(f, D);
  ["cp", "sp", "ep", "gp", "pp"].forEach((k) => { c.coins[k] = num(f, k.toUpperCase()) || 0; });

  // ---- armor, shield, and weapons come out of the equipment list. (The "=== ARMOR ===" block
  // in the proficiencies box lists armor *proficiencies*, not what's worn.) Whatever becomes the
  // worn armor, the shield, or a matched weapon leaves the item list so its weight isn't counted
  // twice. A "+1" in the name, before or after, becomes the magic bonus.
  const profBox = val(f, "ProficienciesLang");
  const plus = (name) => {
    const m = /(?:^\+(\d)\s+|[,\s]+\+(\d)\s*$)/.exec(name);
    return { bare: name.replace(/^\+\d\s+|[,\s]+\+\d\s*$/, "").trim(), magic: m ? +(m[1] || m[2]) : 0 };
  };
  const armorFor = (bare) => D.ARMOR.find((a) => a.cat !== "shield" && (norm(a.name) === norm(bare) || norm(a.name) === norm(bare + " armor")));
  const armorItems = c.items.filter((i) => armorFor(plus(i.name).bare));
  if (armorItems.length) {
    const worn = armorItems[0], p = plus(worn.name);
    c.armor = armorFor(p.bare).name; c.armorMagic = p.magic;
    c.items = c.items.filter((i) => i !== worn || (i.qty = (i.qty || 1) - 1) > 0);
    if (armorItems.length > 1) report.review.push(`More than one suit of armor came across; ${worn.name} is set as worn. Change it on the Gear tab if that's wrong.`);
  }
  const shieldItem = c.items.find((i) => /^shield$/i.test(plus(i.name).bare));
  if (shieldItem) {
    c.shield = true; c.shieldMagic = plus(shieldItem.name).magic;
    c.items = c.items.filter((i) => i !== shieldItem || (i.qty = (i.qty || 1) - 1) > 0);
  }
  c.weapons.filter((w) => w.base).forEach((w) => {
    const hit = c.items.find((i) => norm(i.name) === norm(w.name) || norm(plus(i.name).bare) === norm(w.base));
    if (hit) c.items = c.items.filter((i) => i !== hit || (i.qty = (i.qty || 1) - 1) > 0);
  });
  const langLine = /=== LANGUAGES ===\s*\n(.+)/.exec(profBox);
  if (langLine) c.languages = langLine[1].split(",").map((s) => s.trim()).filter(Boolean);
  const weaponLine = /=== WEAPONS ===\s*\n(.+)/.exec(profBox);
  if (weaponLine) c.extraProfs = weaponLine[1].split(",").map((s) => s.trim()).filter(Boolean);

  // ---- features. Subclass names come from the "| Wild/Shadow Magic" line under Sorcerous Origin.
  const featureText = [1, 2, 3, 4].map((i) => val(f, "FeaturesTraits" + i)).join("\n");
  const blocks = parseFeatureBlocks(featureText);
  const subclassPick = blocks.find((b) => /(Origin|Archetype|Path|College|Domain|Circle|Tradition|Oath|Patron|Conclave)/i.test(b.name) && b.choice);
  if (subclassPick && c.classes[0]) {
    const sc = D.SUBCLASSES.find((s) => s.cls === c.classes[0].cls && norm(s.name) === norm(subclassPick.choice));
    if (sc) { c.classes[0].subclass = sc.key; report.matched.push(`Subclass: ${sc.name}`); }
    else {
      c.classes[0].subclass = "__custom";
      c.classes[0].subclassName = subclassPick.choice;
      report.custom.push(`Subclass "${subclassPick.choice}" isn't in the bundled books — kept by name.`);
    }
  }
  // everything the app already knows about (class features, racial traits) is skipped;
  // the rest becomes a custom feature, with its book and page kept.
  const known = new Set();
  c.classes.forEach((cl) => {
    (D.CLASSES[cl.cls]?.features || []).forEach((x) => x.level <= cl.level && known.add(norm(x.name)));
    const sc = E.findSubclass(D, cl.cls, cl.subclass);
    (sc?.features || []).forEach((x) => x.level <= cl.level && known.add(norm(x.name)));
  });
  const feats = [];
  blocks.forEach((b) => {
    if (known.has(norm(b.name))) return;                       // the app already has this feature
    if (/^(Hit Points|Proficiencies|Ability Score Improvement|Ability Score Increase|Languages|Size|Speed|Age|Alignment|Creature Type)$/i.test(b.name)) return;
    const desc = [b.choice ? `Choice: ${b.choice}` : "", b.desc].filter(Boolean).join("\n");
    if (/FEATS?$/i.test(b.section) && !b.uses) { feats.push({ id: E.uid(), name: b.name, desc, picks: [] }); return; }
    if (/(SPECIES|RACE|RACIAL)/i.test(b.section) && c.race === "__custom") {
      c.customRace.traits.push({ name: b.name, desc });        // homebrew race traits belong to the race
      return;
    }
    const entry = { id: E.uid(), name: b.name, source: b.source || b.section, desc };
    if (b.uses) entry.uses = { max: b.uses.max, reset: b.uses.reset };
    c.customFeatures.push(entry);
  });
  c.customFeats = feats;

  // ---- spells
  const spells = parseSpells(f);
  const primaryCaster = val(f, "spellCastingClass0");
  const casterKey = Object.keys(D.CLASSES).find((k) => norm(D.CLASSES[k].name) === norm(primaryCaster)) || c.classes[0]?.cls;
  const customSpells = [];
  spells.forEach((s) => {
    const inData = D.SPELLS.find((x) => norm(x.name) === norm(s.name));
    c.spells.push({ name: s.name, cls: casterKey, prepared: s.prepared, level: s.level, always: /always prepared/i.test(s.source) });
    if (!inData) {
      customSpells.push({
        name: s.name, level: s.level, time: s.time, range: s.range, comp: s.comp, dur: s.dur,
        conc: /concentration/i.test(s.dur) || /conc/i.test(s.notes), source: s.source, page: s.page,
        save: s.saveHit && s.saveHit !== "--" ? s.saveHit : "", desc: "",
      });
    }
  });
  c.customSpells = customSpells;
  if (customSpells.length) report.custom.push(`${customSpells.length} spells aren't in the bundled books — kept with their book and page reference: ${customSpells.map((s) => s.name).join(", ")}.`);

  // ---- notes: the boxes with no home of their own
  c.notes = [
    val(f, "Defenses") && "Defenses: " + val(f, "Defenses"),
    val(f, "SaveModifiers") && "Saving throw notes: " + val(f, "SaveModifiers"),
    val(f, "AdditionalSenses") && "Senses: " + val(f, "AdditionalSenses"),
    val(f, "AlliesOrganizations") && "Allies: " + val(f, "AlliesOrganizations"),
    val(f, "AdditionalNotes1"), val(f, "Backstory"),
  ].filter(Boolean).join("\n\n");

  // ---- reconcile: make the app's numbers agree with the printed sheet
  const pdfAc = num(f, "AC"), pdfInit = num(f, "Init"), pdfSpeed = parseInt(val(f, "Speed"), 10);
  let dv = E.derive(c, D);
  if (maxHp != null && dv.hpMax !== maxHp) { c.bonuses.hpFlat = maxHp - dv.hpMax; report.adjusted.push(`Hit points set to ${maxHp} (${E.sgn(c.bonuses.hpFlat)} by hand — rolled HP and racial bonuses aren't in the export)`); }
  const saveGaps = ABIL.map((a) => (num(f, "ST " + { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[a]) ?? null) - dv.saves[a].mod);
  if (saveGaps.every((g) => Number.isFinite(g) && g === saveGaps[0]) && saveGaps[0] !== 0) {
    c.bonuses.saves = saveGaps[0];
    report.adjusted.push(`All saving throws ${E.sgn(saveGaps[0])} (a cloak, a ring, or an aura)`);
  }
  dv = E.derive(c, D);
  if (pdfAc != null && dv.ac !== pdfAc) { c.bonuses.acSet = pdfAc; report.adjusted.push(`Armor Class set to ${pdfAc} until you check your armor and items on the Gear tab`); }
  if (Number.isFinite(pdfInit) && dv.init !== pdfInit) { c.bonuses.init = pdfInit - dv.init; report.adjusted.push(`Initiative ${E.sgn(pdfInit - dv.init)}`); }
  if (Number.isFinite(pdfSpeed) && dv.speed !== pdfSpeed) { c.bonuses.speed = pdfSpeed - dv.speed; report.adjusted.push(`Speed ${E.sgn(pdfSpeed - dv.speed)}`); }
  c.hp = maxHp != null ? E.derive(c, D).hpMax : null;

  // ---- anything the export can't tell us
  report.review.push("Hit points per level, chosen feats, and ability score improvements aren't in the export. The totals are right, but the Build tab won't show how you got there.");
  if (c.weapons.some((w) => !w.base)) report.review.push("Some weapons weren't matched to a bundled weapon; check their damage on the Gear tab.");

  return { character: c, report, printed: { ac: pdfAc, hpMax: maxHp, init: pdfInit, speed: pdfSpeed, pb: num(f, "ProfBonus"), spellDC: num(f, "spellSaveDC0"), spellAtk: num(f, "spellAtkBonus0"), passive: num(f, "Passive1") } };
}

// Compares what the app derives against what the sheet printed, so the import can show its work.
export function compareToPrinted(c, D, printed) {
  const dv = E.derive(c, D);
  const rows = [
    ["Armor Class", dv.ac, printed.ac], ["Max HP", dv.hpMax, printed.hpMax],
    ["Initiative", dv.init, printed.init], ["Speed", dv.speed, printed.speed],
    ["Proficiency bonus", dv.pb, printed.pb], ["Passive Perception", dv.passive.perception, printed.passive],
    ["Spell save DC", dv.spell.casters[0]?.dc ?? null, printed.spellDC],
    ["Spell attack", dv.spell.casters[0]?.atk ?? null, printed.spellAtk],
  ].filter((r) => r[2] != null);
  return rows.map(([label, ours, theirs]) => ({ label, ours, theirs, ok: ours === theirs }));
}

export async function importPdf(bytes, PDFLib, D, system = "2024") {
  const fields = await readPdfFields(bytes, PDFLib);
  if (!Object.keys(fields).some((k) => /CharacterName|CLASS  LEVEL/.test(k))) {
    throw new Error("This doesn't look like a D&D Beyond character sheet export. Use the PDF from the character's Export option.");
  }
  const { character, report, printed } = fieldsToCharacter(fields, D, system);
  return { character, report, printed, check: compareToPrinted(character, D, printed) };
}
