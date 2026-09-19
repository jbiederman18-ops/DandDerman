// Gear checks: armor and shield AC, magic bonuses, item bonuses, attunement, coin weight.
import * as E from "../src/dnd5e-engine.js";
let pass = 0, fail = 0;
const eq = (label, got, want) => { if (got === want) pass++; else { fail++; console.log("FAIL", label, "got", got, "want", want); } };
for (const sys of ["2024", "2014"]) {
  const D = await import(sys === "2014" ? "../src/dnd5e-data.js" : "../src/dnd5e-data-2024.js");
  const base = () => ({ ...E.newChar("T", sys), base: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 } }); // fighter 1, Dex +2
  const d = (patch) => E.derive({ ...base(), ...patch }, D);
  const t = (l) => `${sys} ${l}`;
  eq(t("unarmored"), d({}).ac, 12);
  eq(t("chain mail"), d({ armor: "Chain Mail" }).ac, 16);
  eq(t("chain mail +1"), d({ armor: "Chain Mail", armorMagic: 1 }).ac, 17);
  eq(t("half plate caps dex at 2"), d({ armor: D.ARMOR.find((a) => /half.?plate/i.test(a.name)).name, base: { ...base().base, dex: 18 } }).ac, 17);
  eq(t("leather + shield +1"), d({ armor: D.ARMOR.find((a) => /^leather/i.test(a.name)).name, shield: true, shieldMagic: 1 }).ac, 11 + 2 + 3);
  const ring = { id: "r", name: "Ring of Protection", qty: 1, wt: 0 };
  eq(t("ring unattuned"), d({ items: [ring] }).ac, 12);
  eq(t("ring attuned AC"), d({ items: [{ ...ring, attuned: true }] }).ac, 13);
  eq(t("ring attuned save"), d({ items: [{ ...ring, attuned: true }] }).saves.str.mod, d({}).saves.str.mod + 1);
  eq(t("ring set to 0 by hand"), d({ items: [{ ...ring, attuned: true, ac: 0 }] }).ac, 12);
  const bracers = { id: "b", name: "Bracers of Defense", attuned: true };
  eq(t("bracers unarmored"), d({ items: [bracers] }).ac, 14);
  eq(t("bracers with shield"), d({ items: [bracers], shield: true }).ac, 14);
  eq(t("custom item +1 no attunement"), d({ items: [{ id: "c", name: "Lucky Pebble", ac: 1 }] }).ac, 13);
  eq(t("acSet still overrides"), d({ bonuses: { ...base().bonuses, acSet: 19 } }).ac, 19);
  eq(t("acCalc exposed under acSet"), d({ bonuses: { ...base().bonuses, acSet: 19 } }).acCalc, 12);
  eq(t("coin weight"), d({ coins: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 } }).coinWt, 2);
  eq(t("carried includes armor+coins"), d({ armor: "Chain Mail", coins: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 } }).carried, 56);
  eq(t("attuned count"), d({ items: [{ ...ring, attuned: true }, bracers] }).attuned, 2);
  eq(t("weapon +1 attack"), d({ weapons: [{ id: "w", base: "Longsword", magic: 1 }] }).attacks[1].atk, d({ weapons: [{ id: "w", base: "Longsword" }] }).attacks[1].atk + 1);
  eq(t("weapon +1 damage"), d({ weapons: [{ id: "w", base: "Longsword", magic: 1 }] }).attacks[1].dmg, d({ weapons: [{ id: "w", base: "Longsword" }] }).attacks[1].dmg + 1);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
