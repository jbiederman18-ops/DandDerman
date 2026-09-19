// Homebrew checks: wiki addresses, pasting a wiki page, merging the library into the rules,
// and filling in imported entries that only had a name.
import * as H from "../src/homebrew.js";
import * as E from "../src/dnd5e-engine.js";
let pass = 0, fail = 0;
const eq = (l, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.log("FAIL", l, "\n  got ", JSON.stringify(g), "\n  want", JSON.stringify(w)); } };

// Addresses exactly as they appear on dnd2024.wikidot.com
eq("slug apostrophe-s", H.wikiUrl("spell", "Hunter's Mark", "2024"), "https://dnd2024.wikidot.com/spell:hunter-s-mark");
eq("slug curly apostrophe", H.slug("Tasha’s Hideous Laughter"), "tasha-s-hideous-laughter");
eq("slug slash", H.slug("Blindness/Deafness"), "blindness-deafness");
eq("slug trailing apostrophe", H.slug("Lords' Alliance Agent"), "lords-alliance-agent");
eq("slug heroes' feast", H.slug("Heroes' Feast"), "heroes-feast");
eq("feat url", H.wikiUrl("feat", "Great Weapon Master", "2024"), "https://dnd2024.wikidot.com/feat:great-weapon-master");
eq("item url", H.wikiUrl("item", "Bag of Holding", "2024"), "https://dnd2024.wikidot.com/magic-item:bag-of-holding");
eq("subclass url", H.wikiUrl("subclass", "Battle Master", "2024", { cls: "fighter" }), "https://dnd2024.wikidot.com/fighter:battle-master");
eq("2014 species", H.wikiUrl("species", "Tabaxi", "2014"), "https://dnd5e.wikidot.com/lineage:tabaxi");
eq("search", H.wikiSearch("Melf's Acid Arrow", "2024"), "https://dnd2024.wikidot.com/search:site/q/Melf's%20Acid%20Arrow");

// A spell page, copied from the browser the way it lands on the clipboard
const hm = `Hunter's Mark
Home » All Spells » Hunter's Mark
Source: Player's Handbook
Level 1 Divination (Ranger)
Casting Time: Bonus Action
Range: 90 feet
Components: V
Duration: Concentration, up to 1 hour

You magically mark one creature you can see within range as your quarry. Until the spell ends, you deal an extra 1d6 Force damage to the target whenever you hit it with an attack roll. You also have Advantage on any Wisdom (Perception or Survival) check you make to find it.

If the target drops to 0 Hit Points before this spell ends, you can take a Bonus Action to move the mark to a new creature you can see within range.

Using a Higher-Level Spell Slot. Your Concentration can last longer with a spell slot of level 3–4 (up to 8 hours) or 5+ (up to 24 hours).

divination first ranger
Help | Terms of Service | Privacy | Report a bug
Powered by Wikidot.com`;
const p = H.parseWikiPaste(hm, "spell");
eq("spell name", p.name, "Hunter's Mark");
eq("spell source", p.source, "Player's Handbook");
eq("spell level/school", [p.level, p.school], [1, "divination"]);
eq("spell classes", p.classes, ["ranger"]);
eq("spell fields", [p.time, p.range, p.comp, p.dur, p.conc], ["Bonus Action", "90 feet", "V", "Concentration, up to 1 hour", true]);
eq("spell desc start", p.desc.slice(0, 40), "You magically mark one creature you can ");
eq("spell desc keeps paragraph 2", /move the mark/.test(p.desc), true);
eq("spell desc drops tags/footer", /divination first ranger|Powered/.test(p.desc), false);
eq("spell higher", p.higher.slice(0, 30), "Your Concentration can last lo");

// Cantrip, ritual, and material component
const cantrip = `Mind Sliver\nSource: Player's Handbook\nEnchantment Cantrip (Sorcerer, Warlock, Wizard)\nCasting Time: Action\nRange: 60 feet\nComponents: V\nDuration: 1 round\nYou try to temporarily sliver the mind of one creature you can see within range. The target must succeed on an Intelligence saving throw or take 1d6 Psychic damage.\nCantrip Upgrade. The damage increases by 1d6 when you reach levels 5 (2d6), 11 (3d6), and 17 (4d6).`;
const c1 = H.parseWikiPaste(cantrip, "spell");
eq("cantrip", [c1.level, c1.school, c1.classes], [0, "enchantment", ["sorcerer", "warlock", "wizard"]]);
eq("cantrip keeps upgrade in desc", /Cantrip Upgrade/.test(c1.desc) && !c1.higher, true);
const rit = H.parseWikiPaste(`Alarm\nSource: Player's Handbook\nLevel 1 Abjuration (Artificer, Ranger, Wizard)\nCasting Time: 1 minute or Ritual\nRange: 30 feet\nComponents: V, S, M (a bell and silver wire)\nDuration: 8 hours\nYou set an alarm against intrusion.`, "spell");
eq("ritual + material", [rit.ritual, rit.comp, rit.mat], [true, "V, S, M", "a bell and silver wire"]);
// 2014 wording
const old = H.parseWikiPaste(`Tasha's Mind Whip\nSource: Tasha's Cauldron of Everything\n2nd-level enchantment\nCasting Time: 1 action\nRange: 90 feet\nComponents: V\nDuration: 1 round\nYou psychically lash out at one creature you can see within range. The target must make an Intelligence saving throw. On a failed save, the target takes 3d6 psychic damage.\nAt Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd.\nSpell Lists. Sorcerer, Wizard`, "spell");
eq("2014 spell", [old.level, old.school, old.classes, !!old.higher, /Spell Lists/.test(old.desc)], [2, "enchantment", ["sorcerer", "wizard"], true, false]);

// A feat page
const tough = H.parseWikiPaste(`Tough\nHome » Feats » Tough\nSource: Player's Handbook\nOrigin Feat\nYour Hit Point maximum increases by an amount equal to twice your character level when you gain this feat.\ncommon originfeat`, "feat");
eq("feat", [tough.name, tough.cat, tough.desc.slice(0, 22)], ["Tough", "origin", "Your Hit Point maximum"]);
const gwm = H.parseWikiPaste(`Great Weapon Master\nSource: Player's Handbook\nGeneral Feat (Prerequisite: Level 4+, Strength 13+)\nYou gain the following benefits.`, "feat");
eq("feat prereq", [gwm.cat, gwm.prereq], ["general", "Level 4+, Strength 13+"]);
// A magic item page
const bag = H.parseWikiPaste(`Cloak of Displacement\nSource: Dungeon Master's Guide\nWondrous Item, Rare (Requires Attunement)\nWhile you wear this cloak, it projects an illusion.`, "item");
eq("item", [bag.type, bag.rarity, bag.attune, bag.desc], ["Wondrous Item", "rare", true, "While you wear this cloak, it projects an illusion."]);

// Library folded into the rules, and imported name-only entries picking up its text
const D = await import("../src/dnd5e-data-2024.js");
const lib = [
  { id: "a", rev: 1, kind: "spell", system: "2024", ...c1 },
  { id: "b", rev: 1, kind: "feat", system: "2024", name: "Strixhaven Initiate", desc: "You learn two cantrips.", cat: "origin" },
  { id: "c", rev: 1, kind: "feature", system: "both", name: "Combat Superiority", desc: "You learn maneuvers." },
  { id: "d", rev: 1, kind: "item", system: "2024", name: "Cloak of Displacement", desc: "Illusion.", rarity: "rare", attune: true },
  { id: "e", rev: 1, kind: "spell", system: "2014", name: "Only Old", level: 1, desc: "x" },
  { id: "f", rev: 1, kind: "spell", system: "2024", name: "Fireball", level: 3, desc: "homebrew fireball" },
];
const DL = H.withLibrary(D, lib);
eq("library spell in list", DL.SPELLS.some((s) => s.name === "Mind Sliver" && s.homebrew), true);
eq("other ruleset kept out", DL.SPELLS.some((s) => s.name === "Only Old"), false);
eq("bundled wins on clash", DL.SPELLS.filter((s) => s.name === "Fireball").length, 1);
eq("library feat", DL.FEATS.some((f) => f.name === "Strixhaven Initiate"), true);
eq("library item", DL.MAGIC_ITEMS.some((f) => f.name === "Cloak of Displacement"), true);
eq("merge is cached", H.withLibrary(D, lib) === DL, true);
eq("no library → same object", H.withLibrary(D, []), D);

const ch = { ...E.newChar("R", "2024"), classes: [{ cls: "ranger", level: 3, subclass: "", hp: [], skills: [], asi: {} }],
  spells: [{ name: "Mind  sliver", cls: "ranger", prepared: true }, { name: "Zephyr Strike", cls: "ranger", prepared: true }],
  customSpells: [{ name: "Zephyr Strike", level: 1, source: "Xanathar's", page: "171", desc: "" }],
  customFeats: [{ id: "f1", name: "Strixhaven Initiate", desc: "" }],
  customFeatures: [{ id: "x1", name: "Combat Superiority", desc: "" }, { id: "x2", name: "Know Your Enemy", desc: "" }],
  items: [{ id: "i1", name: "Cloak of Displacement", attuned: true }, { id: "i2", name: "Weird Trinket", attuned: true }] };
const before = E.derive(ch, D), after = E.derive(ch, DL);
eq("spell text before library", !!before.spell.spells.find((s) => s.name === "Mind  sliver").data?.desc, false);
eq("spell text from library (loose name match)", after.spell.spells.find((s) => s.name === "Mind  sliver").data.desc.slice(0, 11), "You try to ");
eq("library spell keeps its level", after.spell.spells.find((s) => s.name === "Mind  sliver").level, 0);
eq("feat text from library", after.features.find((f) => f.name === "Strixhaven Initiate").desc, "You learn two cantrips.");
eq("feature text from library", after.features.find((f) => f.name === "Combat Superiority").desc, "You learn maneuvers.");
const miss = H.missingEntries(ch, after, DL).map((m) => m.kind + ":" + m.name);
eq("still missing", miss, ["spell:Zephyr Strike", "feature:Know Your Enemy", "item:Weird Trinket"]);
eq("dismissed drops out", H.missingEntries({ ...ch, hbDismissed: ["item:Weird Trinket"] }, after, DL).length, 2);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
