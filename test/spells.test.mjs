// Spell checks: casting from slots, upcasting, pact magic, arcanum, rituals, concentration,
// dice scaling, attack/save detection, custom spells.
import * as E from "../src/dnd5e-engine.js";
let pass = 0, fail = 0;
const eq = (l, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL", l, "got", JSON.stringify(g), "want", JSON.stringify(w)); } };
for (const sys of ["2024", "2014"]) {
  const D = await import(sys === "2014" ? "../src/dnd5e-data.js" : "../src/dnd5e-data-2024.js");
  const t = (l) => sys + " " + l;
  const wiz = (lvl, extra = {}) => ({ ...E.newChar("W", sys), base: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
    classes: [{ cls: "wizard", level: lvl, subclass: "", hp: [], skills: [], asi: {} }], ...extra });
  const sp = (c, name) => E.derive(c, D).spell.spells.find((s) => s.name === name);
  // wizard 5: slots 4/3/2
  let c = wiz(5, { spells: [{ name: "Fireball", cls: "wizard", prepared: true }, { name: "Fire Bolt", cls: "wizard", prepared: true }, { name: "Detect Magic", cls: "wizard", prepared: true }, { name: "Hold Person", cls: "wizard", prepared: true }] });
  let dv = E.derive(c, D);
  eq(t("caster maxLevel"), dv.spell.casters[0].maxLevel, 3);
  const fb = sp(c, "Fireball");
  eq(t("fireball options"), E.castOptions(c, dv, fb).map((o) => o.kind + (o.level || "")), ["slot3"]);
  const r = E.castSpell(c, dv, fb, { kind: "slot", level: 3 });
  eq(t("fireball spends 3rd"), r.patch.slotsUsed, { 3: 1 });
  eq(t("fireball dice"), E.spellDice(fb, 3, 5), "8d6");
  eq(t("fireball save"), E.spellCheck(fb), { kind: "save", ability: "dex" });
  const bolt = sp(c, "Fire Bolt");
  eq(t("fire bolt free"), E.castOptions(c, dv, bolt)[0].kind, "free");
  eq(t("fire bolt dice at 5"), E.spellDice(bolt, 0, 5), "2d10");
  eq(t("fire bolt dice at 1"), E.spellDice(bolt, 0, 1), "1d10");
  eq(t("fire bolt attack"), E.spellCheck(bolt), { kind: "attack" });
  eq(t("detect magic has ritual"), E.castOptions(c, dv, sp(c, "Detect Magic")).some((o) => o.kind === "ritual"), true);
  const hp = sp(c, "Hold Person");
  eq(t("hold person upcast options"), E.castOptions(c, dv, hp).map((o) => o.level), [2, 3]);
  const r2 = E.castSpell({ ...c, concentration: "Bless" }, dv, hp, { kind: "slot", level: 3 });
  eq(t("hold person concentration"), r2.patch.concentration, "Hold Person");
  eq(t("drops Bless"), r2.events[0], { type: "dropped", spell: "Bless" });
  // spent slots are not offered
  const c3 = { ...c, slotsUsed: { 3: 2 } };
  eq(t("no 3rd slots left"), E.castOptions(c3, E.derive(c3, D), fb).length, 0);
  eq(t("cast refused when empty"), E.castSpell(c3, E.derive(c3, D), fb, { kind: "slot", level: 3 }).events[0].type, "unavailable");
  // cure wounds upcast
  const cw = { name: "Cure Wounds", level: 1, data: D.SPELLS.find((s) => s.name === "Cure Wounds") };
  eq(t("cure wounds at 3rd"), E.spellDice(cw, 3, 5), sys === "2024" ? "6d8" : "3d8");
  // warlock pact + arcanum
  const wl = { ...E.newChar("L", sys), classes: [{ cls: "warlock", level: 11, subclass: "", hp: [], skills: [], asi: {} }],
    spells: [{ name: "Hold Person", cls: "warlock", prepared: true }, { name: "Circle of Death", cls: "warlock", prepared: true }] };
  const wdv = E.derive(wl, D);
  eq(t("warlock pact"), [wdv.spell.pact.level, wdv.spell.pact.count], [5, 3]);
  eq(t("warlock maxLevel"), wdv.spell.casters[0].maxLevel, 6);
  const hpW = wdv.spell.spells.find((s) => s.name === "Hold Person");
  eq(t("pact cast"), E.castSpell(wl, wdv, hpW, { kind: "pact" }).patch.pactUsed, 1);
  const cod = wdv.spell.spells.find((s) => s.name === "Circle of Death");
  eq(t("arcanum offered"), E.castOptions(wl, wdv, cod).map((o) => o.kind), ["arcanum"]);
  eq(t("arcanum spent"), E.castSpell(wl, wdv, cod, { kind: "arcanum", level: 6 }).patch.arcanumUsed, { 6: 1 });
  const wl2 = { ...wl, arcanumUsed: { 6: 1 } };
  eq(t("arcanum once"), E.castOptions(wl2, E.derive(wl2, D), cod).length, 0);
  eq(t("long rest clears arcanum"), E.longRest(wl2, E.derive(wl2, D)).arcanumUsed, {});
  // custom spell from another book
  const cc = wiz(3, { spells: [{ name: "Tasha's Mind Whip", cls: "wizard", prepared: true }],
    customSpells: [{ name: "Tasha's Mind Whip", level: 2, desc: "The target must make an Intelligence saving throw. On a failed save, the target takes 3d6 psychic damage.", higher: "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd." }] });
  const mw = sp(cc, "Tasha's Mind Whip");
  eq(t("custom spell level"), mw.level, 2);
  eq(t("custom spell dice"), E.spellDice(mw, 2, 3), "3d6");
  eq(t("custom spell save"), E.spellCheck(mw), { kind: "save", ability: "int" });
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
