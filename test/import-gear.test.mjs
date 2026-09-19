// Import checks for gear: worn armor and shield from the equipment list, +N bonuses,
// no double-counted weight, and the Ring of Protection counting without a hand-set AC.
import { fieldsToCharacter, compareToPrinted } from "../src/ddb-import.js";
import * as E from "../src/dnd5e-engine.js";
const D = await import("../src/dnd5e-data-2024.js");
let pass = 0, fail = 0;
const eq = (l, g, w) => { if (g === w) pass++; else { fail++; console.log("FAIL", l, "got", g, "want", w); } };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: String(v), page: 0, y: 0 }]));
const f = F({
  CharacterName: "Brenna", "CLASS  LEVEL": "Fighter 5", RACE: "Human", BACKGROUND: "Soldier",
  STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8, MaxHP: 44, AC: 21,
  "Eq Name0": "Chain Mail, +1", "Eq Qty0": 1, "Eq Weight0": "55 lb.",
  "Eq Name1": "Shield", "Eq Qty1": 1, "Eq Weight1": "6 lb.",
  "Eq Name2": "Longsword", "Eq Qty2": 1, "Eq Weight2": "3 lb.",
  "Eq Name3": "Ring of Protection", "Eq Qty3": 1, "Eq Weight3": "--",
  "Eq Name4": "Rations", "Eq Qty4": 5, "Eq Weight4": "2 lb.",
  "Attuned Name1": "Ring of Protection",
  "Wpn Name": "Longsword", "Wpn1 Damage": "1d8+3 Slashing", "Wpn1 AtkBonus": "+6",
  ProficienciesLang: "=== ARMOR ===\nLight Armor, Medium Armor, Heavy Armor, Shields\n=== WEAPONS ===\nMartial Weapons, Simple Weapons",
});
const { character: c, report } = fieldsToCharacter(f, D, "2024");
const dv = E.derive(c, D);
eq("armor", c.armor, "Chain Mail"); eq("armor +1", c.armorMagic, 1);
eq("shield", c.shield, true);
eq("items left", c.items.map((i) => i.name).join("|"), "Ring of Protection|Rations");
eq("sheet AC 21 still wins while set by hand", dv.ac, 21);
eq("acSet only because the sheet disagrees", c.bonuses.acSet, 21);
eq("acCalc", dv.acCalc, 20);
eq("weight 55+6+3+10", dv.carried, 74);
const f2 = { ...f, AC: { value: "20", page: 0, y: 0 } };
const r2 = fieldsToCharacter(f2, D, "2024");
eq("sheet agrees: no hand-set AC", +r2.character.bonuses.acSet || 0, 0);
eq("sheet agrees: AC 20", E.derive(r2.character, D).ac, 20);
eq("sheet agrees: AC check passes", compareToPrinted(r2.character, D, r2.printed).find((x) => x.label === "Armor Class").ok, true);
console.log(report.adjusted.join("\n"));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
