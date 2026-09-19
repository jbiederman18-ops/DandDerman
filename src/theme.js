// theme.js — the look of the sheet, ported from the Pathfinder app.
//
// Every theme is a block of CSS custom properties plus an optional block of extra
// rules. The components below never name a colour directly; they read variables,
// so a theme can change the typeface, the corner radius, the shadows and the dice
// without touching a single component.

const BASE = `
*{box-sizing:border-box}
html,body{margin:0;background:var(--ink)}
.dn{font-family:var(--font);color:var(--tx);background:var(--ink);background-image:var(--bgimg);
background-attachment:fixed;min-height:100vh;font-variant-numeric:tabular-nums;
-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.45}
:where(.dn) button{font:inherit;color:inherit;background:none;border:none;cursor:pointer;padding:0}
:where(.dn) :is(input,select,textarea){font:inherit;color:var(--tx);background:var(--pan2);
border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:7px 9px;width:100%}
.dn :is(input,select,textarea):focus{outline:2px solid var(--brass);outline-offset:1px}
/* Safari zooms the page when you focus anything under 16px, which rearranges the
   screen mid-fight just because you typed a damage number. */
@media(max-width:719px){.dn :is(input,select,textarea){font-size:16px}}
/* Long-press is a control here, not an invitation to select text. */
.dn button{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.dn input,.dn textarea{-webkit-user-select:text;user-select:text}
.dn button:focus-visible,.dn summary:focus-visible{outline:2px solid var(--brass);outline-offset:2px}

.wrap{max-width:1180px;margin:0 auto;
padding:0 calc(12px + env(safe-area-inset-right)) calc(110px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left))}
.top{position:sticky;top:0;padding-top:env(safe-area-inset-top);z-index:30;background:var(--topbg);
border-bottom:var(--bd) solid var(--line);backdrop-filter:blur(8px)}
.topin{max-width:1180px;margin:0 auto;padding:9px 12px;display:flex;align-items:center;gap:8px;position:relative;z-index:2}
.nm{font-family:var(--fontd);font-weight:800;font-size:17px;letter-spacing:var(--trackd);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{color:var(--mut);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tabs{display:flex;gap:3px;overflow-x:auto;padding:0 8px 8px;max-width:1180px;margin:0 auto;
scrollbar-width:none;position:relative;z-index:2}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:6px 13px;border-radius:var(--pillrad);color:var(--mut);font-size:13.5px;font-weight:600;
white-space:nowrap;border:var(--bd) solid transparent}
.tab.on{background:var(--pan2);color:var(--tx);border-color:var(--line);box-shadow:var(--btnshadow)}
.savest{margin-left:auto;align-self:center;padding:0 6px 0 8px;display:flex;align-items:center;gap:6px;white-space:nowrap}
.savedot{width:7px;height:7px;border-radius:50%;background:var(--verd);flex:none}
.savest[data-s="saving"] .savedot{background:var(--brass)}
.savest[data-s="err"] .savedot{background:var(--crim)}
@media (max-width:560px){.dn .tabs .tab{padding:6px 8px;letter-spacing:.03em}
.dn .tabs .tab[data-tab]:not(.on):before{display:none}
.savelbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.savest[data-s="err"] .savelbl{position:static;width:auto;height:auto;clip:auto}}

.card{background:var(--pan);border:var(--bd) solid var(--line);border-radius:var(--rad);padding:13px;
margin:10px 0;box-shadow:var(--cardshadow)}
.card h3{margin:0 0 9px;font-family:var(--fontd);font-size:var(--h3size);font-weight:800;color:var(--brass);
letter-spacing:var(--trackd)}
.row{display:flex;align-items:center;gap:9px}.wraprow{flex-wrap:wrap}
.between{display:flex;align-items:center;justify-content:space-between;gap:9px}
.grid{display:grid;gap:8px}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.g6{grid-template-columns:repeat(3,1fr)}
@media(min-width:720px){.g6{grid-template-columns:repeat(6,1fr)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}}

.stat{background:var(--pan2);border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:9px 6px;
text-align:center;box-shadow:var(--statshadow);width:100%}
.stat .v{font-family:var(--fontd);font-size:23px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.stat .l{font-size:10.5px;color:var(--mut);margin-top:2px;font-weight:600}
.stat .s{font-size:10px;color:var(--steel)}

.btn{background:var(--pan2);border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:8px 12px;
font-weight:600;font-size:14px;box-shadow:var(--btnshadow);display:inline-block;text-decoration:none}
.btn:hover{border-color:var(--brass)}
.btn:active{transform:translate(1px,1px)}
.btn.pri{background:var(--brass);color:var(--onbrass);border-color:var(--brass)}
.btn.dan{background:var(--danbg);border-color:var(--danbd);color:var(--dantx)}
.btn.gd{background:var(--gdbg);border-color:var(--gdbd);color:var(--gdtx)}
.btn.sm{padding:4px 9px;font-size:12.5px}
.btn:disabled{opacity:.45;cursor:not-allowed}

.hpbar{height:16px;background:var(--hpbg);border-radius:var(--pillrad);overflow:hidden;border:var(--bd) solid var(--line)}
.hpfill{height:100%;background:var(--hpfill);transition:width .25s ease}
.hpnum{font-family:var(--fontd);font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1}

.pill{display:inline-flex;align-items:center;gap:6px;background:var(--pan2);border:var(--bd) solid var(--line);
border-radius:var(--pillrad);padding:4px 10px;font-size:12.5px;font-weight:600}
.pill.on{background:var(--pillon);border-color:var(--brass);color:var(--brass)}
.pill:disabled{opacity:.4}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.line{border-top:var(--bd) solid var(--line);margin:11px 0}
.mut{color:var(--mut)}.sm{font-size:12.5px}.xs{font-size:11.5px}
.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--pan2);color:var(--mut);
border:var(--bd) solid var(--line);white-space:nowrap}
.badge.gold{color:var(--brass);border-color:var(--pillon);background:var(--pillon)}
.empty{text-align:center;color:var(--mut);padding:22px 10px;font-size:13.5px}
.link{color:var(--brass);text-decoration:none;border-bottom:1px dotted var(--brass);font-size:12px}

.atk{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid var(--line2)}
.atk:last-child{border-bottom:none}
.maps{display:flex;gap:5px}
.mapb{background:var(--pan2);border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:5px 9px;
font-family:var(--fontd);font-weight:800;font-size:14px;min-width:46px;text-align:center;box-shadow:var(--btnshadow)}
.mapb:hover{border-color:var(--brass)}
.mapb small{display:block;font-size:9px;color:var(--mut);font-weight:600;font-family:var(--font)}

.skrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line2)}
.skrow:last-child{border-bottom:none}
.mo{font-family:var(--fontd);font-weight:800;font-size:15px;min-width:40px;text-align:right}
.dot{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--steel);flex:none;display:inline-block}
.dot.p1{background:var(--steel)}
.dot.p2{background:var(--brass);border-color:var(--brass)}
.dot.ph{background:linear-gradient(90deg,var(--steel) 50%,transparent 50%)}
.dot.done{background:var(--verd);border-color:var(--verd)}

.ab{background:var(--pan2);border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:9px;text-align:center}
.ab .sc{font-family:var(--fontd);font-size:24px;font-weight:800;line-height:1.05}
.ab .md2{font-size:13px;color:var(--brass);font-weight:700}
.ab .lb{font-size:11px;color:var(--mut);font-weight:600}
.stepper{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px}
.stepper button{width:28px;height:28px;border-radius:50%;background:var(--pan);border:var(--bd) solid var(--line);font-weight:800}
.stepper button:disabled{opacity:.35}

details.ft{border-bottom:1px solid var(--line2);padding:8px 0}
details.ft:last-child{border-bottom:none}
details.ft summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px}
details.ft summary::-webkit-details-marker{display:none}
details.ft summary .ttl{font-weight:650}
details.ft summary:after{content:"+";color:var(--mut);font-weight:700;width:14px;text-align:center;flex:none}
details.ft[open] summary:after{content:"\\2212"}
.md{font-size:13.5px;color:var(--tx);opacity:.88;margin-top:6px}
.md p{margin:0 0 8px}.md ul{margin:0 0 8px;padding-left:20px}
.md .tbl{overflow-x:auto;margin:0 0 8px}
.md table{border-collapse:collapse;font-size:12px}
.md td,.md th{border:1px solid var(--line);padding:3px 6px;white-space:nowrap}

.clsbox{border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:11px;margin-bottom:10px;background:var(--pan2)}
.opt{display:block;width:100%;text-align:left;border:var(--bd) solid var(--line);border-radius:var(--radsm);
padding:9px 11px;margin-bottom:6px;background:var(--pan2);box-shadow:var(--btnshadow)}
.opt:hover{border-color:var(--brass)}
.opt.on{border-color:var(--brass);background:var(--pillon)}
.step{border-left:2px solid var(--line);padding:2px 0 10px 12px;margin-left:4px}
.step.done{border-left-color:var(--verd)}
.step h4{margin:0 0 7px;font-size:14px}
.hpcells{display:flex;flex-wrap:wrap;gap:5px}
.hpcells input{width:52px;text-align:center;padding:5px 4px}
.hpcells .fixed{width:52px;text-align:center;padding:5px 4px;border:1px dashed var(--line);
border-radius:var(--radsm);color:var(--mut);font-size:14px}
.spl{max-height:320px;overflow:auto;border:var(--bd) solid var(--line);border-radius:var(--radsm);padding:0 9px}
.note{background:var(--pillon);border:var(--bd) solid var(--line);border-left:3px solid var(--brass);
border-radius:var(--radsm);padding:9px 11px;font-size:13px;line-height:1.5;margin:10px 0}
.warn{background:var(--wrnbg);border:1px solid var(--wrnbd);color:var(--wrntx);border-radius:var(--radsm);
padding:8px 10px;font-size:13px;margin:6px 0}
.good{background:var(--gdbg);border:1px solid var(--gdbd);color:var(--gdtx);border-radius:var(--radsm);
padding:8px 10px;font-size:13px;margin:6px 0}

.sheet{position:fixed;inset:0;z-index:50;background:var(--scrim);display:flex;align-items:flex-end;justify-content:center}
.sheetin{background:var(--pan);border:var(--bd) solid var(--line);border-radius:var(--rad) var(--rad) 0 0;
width:100%;max-width:680px;max-height:92vh;overflow:auto;padding:14px}
@media(min-width:720px){.sheet{align-items:center}.sheetin{border-radius:var(--rad)}}

.log{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--pan);border-top:var(--bd) solid var(--line);
padding:9px 12px calc(9px + env(safe-area-inset-bottom));max-height:42vh;overflow:auto}
.logline{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line2);font-size:13px}
.big{font-family:var(--fontd);font-size:19px;font-weight:800}
.crit{color:var(--verd)}.fumble{color:var(--crim)}
.toast{position:fixed;left:50%;transform:translateX(-50%);top:calc(96px + env(safe-area-inset-top));z-index:60;
background:var(--pan2);border:var(--bd) solid var(--brass);border-radius:var(--pillrad);padding:8px 14px;
font-size:13px;font-weight:600}
.swatch{width:15px;height:15px;border-radius:50%;border:2px solid rgba(255,255,255,.25);display:inline-block}

/* --- dice roller --- */
.dicewrap{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;
justify-content:center;gap:9px;background:var(--diceScrim)}
.die{width:116px;height:116px;display:flex;align-items:center;justify-content:center;
font-family:var(--fontd);font-weight:800;font-size:50px;line-height:1;color:var(--tx);
background:var(--diebg);border:3px solid var(--diebd);border-radius:var(--dierad);box-shadow:var(--dieshadow)}
.die[data-phase="rolling"]{animation:tumble .62s ease-out}
.die[data-phase="land"]{animation:land .34s cubic-bezier(.2,1.7,.4,1)}
.die[data-phase="crit"]{animation:land .34s cubic-bezier(.2,1.7,.4,1);border-color:var(--verd);
box-shadow:var(--dieshadow),0 0 34px var(--verd)}
.die[data-phase="fumble"]{animation:shake .42s;border-color:var(--crim);
box-shadow:var(--dieshadow),0 0 28px var(--crim)}
@keyframes tumble{0%{transform:translateY(-150px) rotate(0deg)}
34%{transform:translateY(10px) rotate(210deg)}
54%{transform:translateY(-30px) rotate(310deg)}
76%{transform:translateY(6px) rotate(400deg)}
100%{transform:translateY(0) rotate(360deg)}}
@keyframes land{0%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}
40%{transform:translateX(10px)}60%{transform:translateX(-7px)}80%{transform:translateX(7px)}}
.dicelabel{font-family:var(--fontd);font-weight:800;font-size:17px;text-align:center;padding:0 20px}
.dicemath{color:var(--mut);font-size:13px;text-align:center;padding:0 20px}
.diceverdict{font-family:var(--fontd);font-weight:800;font-size:15px;letter-spacing:.07em}
.dicehint{color:var(--steel);font-size:11px;margin-top:8px}
.critter,.coinpop{display:none}
@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}
`;

const ICONS = {
  // Pixel art drawn for this app; the Mario theme swaps them in, the others ignore them.
  heart: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23e0453a' d='M1 1h2v1H1z M5 1h2v1H5z M0 2h8v2H0z M1 4h6v1H1z M2 5h4v1H2z M3 6h2v1H3z'/><path fill='%23ff9b8c' d='M1 2h1v1H1z M2 3h1v1H2z'/></svg>",
  coin: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23f2b632' d='M3 0h2v1H3z M2 1h4v1H2z M1 2h6v4H1z M2 6h4v1H2z M3 7h2v1H3z'/><path fill='%23a8761a' d='M3 2h2v4H3z'/><path fill='%23ffe08a' d='M2 2h1v4H2z'/></svg>",
  star: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23f2d24b' d='M3 0h2v2H3z M0 2h8v2H0z M1 4h6v1H1z M2 5h4v1H2z M1 6h2v2H1z M5 6h2v2H5z'/><path fill='%23fff3b0' d='M3 2h1v2H3z'/></svg>",
  shield: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%239fb4cc' d='M1 0h6v1H1z M0 1h8v3H0z M1 4h6v2H1z M2 6h4v1H2z M3 7h2v1H3z'/><path fill='%235b7492' d='M3 2h2v3H3z'/></svg>",
  book: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%234a6fa8' d='M0 0h8v7H0z'/><path fill='%232c4570' d='M3 0h2v7H3z'/><path fill='%23efe6d0' d='M1 1h2v5H1z M5 1h2v5H5z'/></svg>",
  box: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23a8701f' d='M0 0h8v8H0z'/><path fill='%236f4710' d='M0 3h8v2H0z M3 0h2v8H3z'/><path fill='%23d8a552' d='M1 1h1v1H1z M6 1h1v1H6z M1 6h1v1H1z M6 6h1v1H6z'/></svg>",
  scroll: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23e8dcc0' d='M0 1h8v6H0z'/><path fill='%237a6a4a' d='M1 2h6v1H1z M1 4h6v1H1z M1 6h4v1H1z'/></svg>",
  fire: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23e0453a' d='M2 1h4v1H2z M1 2h6v4H1z M2 6h4v1H2z'/><path fill='%23f2d24b' d='M3 3h2v2H3z'/></svg>",
  gem: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%237fd4d0' d='M2 0h4v1H2z M1 1h6v2H1z M2 3h4v2H2z M3 5h2v2H3z'/><path fill='%23d8fbf9' d='M3 1h1v2H3z'/></svg>",
  flag: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><path fill='%23cfc9b8' d='M1 0h1v8H1z'/><path fill='%23e0453a' d='M2 1h5v3H2z'/><path fill='%2357a83f' d='M0 7h8v1H0z'/></svg>",
};
const px = (k) => `url("data:image/svg+xml,${ICONS[k]}")`;
const iconRules = (sel, names) => names.map((k) => `.dn ${sel}[data-icon="${k}"]:before{background-image:${px(k)}}`).join("\n");

export const THEMES = {
  slate: {
    name: "Slate",
    blurb: "Near-black glass, one cold accent, hairline rules. Quiet enough for a dim room.",
    dot: "#5fd8ff",
    vars: {
      ink: "#07090e", pan: "#0d1118", pan2: "#141a24", line: "#222c3a", line2: "#19212c",
      tx: "#e8eef7", mut: "#8595aa", steel: "#5a6b82", brass: "#5fd8ff", onbrass: "#04141d",
      crim: "#ff5f6e", verd: "#3ddc97", vio: "#a689ff",
      rad: "14px", radsm: "10px", pillrad: "999px", bd: "1px",
      font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      fontd: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      trackd: ".02em", h3size: "10.5px",
      btnshadow: "none", cardshadow: "inset 0 1px 0 rgba(255,255,255,.045),0 10px 34px rgba(0,0,0,.5)",
      statshadow: "inset 0 1px 0 rgba(255,255,255,.05)",
      topbg: "linear-gradient(180deg,rgba(10,13,19,.94),rgba(10,13,19,.74))",
      hpbg: "#1d1014", hpfill: "linear-gradient(90deg,#7a2530,#ff5f6e)",
      pillon: "rgba(95,216,255,.12)",
      danbg: "#2a1418", danbd: "#57262d", dantx: "#ffb4bb",
      gdbg: "#0f2a24", gdbd: "#235145", gdtx: "#8ee9c4",
      wrnbg: "#2b2413", wrnbd: "#574620", wrntx: "#f0d79a",
      scrim: "rgba(5,7,11,.94)",
      diebg: "linear-gradient(180deg,#18212e,#0d141d)", diebd: "#5fd8ff", dierad: "12px",
      dieshadow: "0 0 0 1px rgba(95,216,255,.18),0 0 46px rgba(95,216,255,.22),inset 0 1px 0 rgba(255,255,255,.08)",
      diceScrim: "rgba(5,7,11,.9)",
      bgimg: "linear-gradient(rgba(95,216,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(95,216,255,.028) 1px,transparent 1px),radial-gradient(1100px 520px at 50% -230px,rgba(95,216,255,.13),transparent 70%)",
    },
    extra: `
/* A 44px survey grid under everything, faint enough to read as texture. */
.dn{background-size:44px 44px,44px 44px,100% 100%}
/* Headings behave like instrument labels: small, tracked, with a hairline out to the edge. */
.dn .card h3{display:flex;align-items:center;gap:10px;margin-bottom:11px;text-transform:uppercase;
letter-spacing:.19em;font-weight:700}
.dn .card h3:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(95,216,255,.4),transparent)}
.dn .card{background:linear-gradient(180deg,rgba(22,29,40,.88),rgba(13,17,24,.88));backdrop-filter:blur(7px)}
.dn .top{border-bottom:none;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.dn .top:after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;pointer-events:none;
background:linear-gradient(90deg,transparent,rgba(95,216,255,.65),transparent)}
.dn .log{background:linear-gradient(180deg,rgba(16,21,29,.96),rgba(10,13,19,.98));backdrop-filter:blur(10px);
border-top-color:rgba(95,216,255,.22)}
.dn .tab{text-transform:uppercase;letter-spacing:.1em;font-size:11.5px}
.dn .tab.on{background:rgba(95,216,255,.1);border-color:rgba(95,216,255,.32);color:var(--brass)}
.dn .stat{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(25,33,45,.9),rgba(15,20,28,.9))}
.dn .stat:after{content:"";position:absolute;left:0;right:0;top:0;height:1px;
background:linear-gradient(90deg,transparent,rgba(95,216,255,.32),transparent)}
.dn .stat .l{text-transform:uppercase;letter-spacing:.11em;font-size:9.5px}
.dn .hpnum{text-shadow:0 0 30px rgba(95,216,255,.22)}
.dn .btn{background:rgba(255,255,255,.03)}
.dn .btn:hover,.dn .mapb:hover{border-color:var(--brass);box-shadow:0 0 0 1px rgba(95,216,255,.22)}
.dn .btn.pri{background:linear-gradient(180deg,#74e2ff,#3ac6ef);border-color:#74e2ff;
box-shadow:0 6px 22px rgba(95,216,255,.3)}
.dn .pill.on{box-shadow:0 0 0 1px rgba(95,216,255,.22)}
/* The die sits inside two tracking rings that widen while it's still moving. */
.dn .die{position:relative}
.dn .die:before,.dn .die:after{content:"";position:absolute;border-radius:26px;
border:1px solid rgba(95,216,255,.2);pointer-events:none}
.dn .die:before{inset:-12px}
.dn .die:after{inset:-24px;border-color:rgba(95,216,255,.1)}
.dn .die[data-phase="rolling"]:before{animation:ping .62s ease-out infinite}
.dn .die[data-phase="rolling"]:after{animation:ping .62s ease-out .14s infinite}
@keyframes ping{from{opacity:.55;transform:scale(.94)}to{opacity:.08;transform:scale(1.06)}}
`,
  },

  underground: {
    name: "Gritty Mario",
    blurb: "Soot-caked brick, warp-pipe green, coin gold. Chunky arcade edges, hard drop shadows, and pixel icons.",
    dot: "#f2b632",
    vars: {
      ink: "#1d120d", pan: "#33211a", pan2: "#412b21", line: "#6a4432", line2: "#4d3226",
      tx: "#f6e8d3", mut: "#bb9878", steel: "#94725a", brass: "#f2b632", onbrass: "#241408",
      crim: "#e0432b", verd: "#57a83f", vio: "#8b6bd6",
      rad: "6px", radsm: "4px", pillrad: "4px", bd: "2px",
      font: '"Helvetica Neue",Helvetica,Arial,sans-serif',
      fontd: '"Arial Black","Arial Bold",Gadget,Impact,sans-serif',
      trackd: ".01em", h3size: "12px",
      btnshadow: "2px 2px 0 rgba(0,0,0,.5)", cardshadow: "3px 3px 0 rgba(0,0,0,.38)",
      statshadow: "inset 0 -3px 0 rgba(0,0,0,.3)",
      topbg: "linear-gradient(180deg,#3a251c,#2a1a13)",
      hpbg: "#2a1512", hpfill: "repeating-linear-gradient(90deg,#e0432b 0 11px,#a82e1c 11px 15px)",
      pillon: "#4a3412",
      danbg: "#48201a", danbd: "#7a352a", dantx: "#f5b5a7",
      gdbg: "#1e3a18", gdbd: "#3d6b30", gdtx: "#b7e3a3",
      wrnbg: "#3a2d10", wrnbd: "#6b551d", wrntx: "#f3d98f",
      scrim: "rgba(12,7,4,.88)",
      diebg: "linear-gradient(180deg,#5c3b2b,#43291e)", diebd: "#8b4a2b", dierad: "7px",
      dieshadow: "inset -5px -5px 0 rgba(0,0,0,.34),inset 5px 5px 0 rgba(255,255,255,.13),5px 5px 0 rgba(0,0,0,.5)",
      diceScrim: "rgba(18,10,6,.82)",
      bgimg: "repeating-linear-gradient(0deg,transparent 0 30px,rgba(0,0,0,.34) 30px 33px),repeating-linear-gradient(90deg,transparent 0 62px,rgba(0,0,0,.26) 62px 65px)",
    },
    extra: `
.dn .top{position:sticky;overflow:hidden;padding-bottom:5px}
.dn .top:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)}
.dn .top:before{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;z-index:3;
background:linear-gradient(180deg,#57a83f 0 2px,#8b4a2b 2px 5px)}
.dn .card{border-top:3px solid rgba(242,182,50,.5)}
.dn .card h3{text-shadow:1px 1px 0 rgba(0,0,0,.55)}
.dn .hpnum{text-shadow:2px 2px 0 rgba(0,0,0,.5)}
.dn .stat .v{text-shadow:1px 1px 0 rgba(0,0,0,.45)}
.dn .line{border-top:0;height:5px;background:repeating-linear-gradient(90deg,#6a4432 0 11px,#2c1b13 11px 13px)}
/* Blocks: four rivets and a lit top edge. */
.dn .stat{background-color:#4a3125;
background-image:radial-gradient(circle at 5px 5px,rgba(255,255,255,.2) 1.4px,transparent 2px),
radial-gradient(circle at calc(100% - 5px) 5px,rgba(255,255,255,.2) 1.4px,transparent 2px),
radial-gradient(circle at 5px calc(100% - 5px),rgba(255,255,255,.2) 1.4px,transparent 2px),
radial-gradient(circle at calc(100% - 5px) calc(100% - 5px),rgba(255,255,255,.2) 1.4px,transparent 2px);
box-shadow:inset -3px -3px 0 rgba(0,0,0,.34),inset 3px 3px 0 rgba(255,255,255,.11)}
.dn .mapb{background:linear-gradient(180deg,#4b3226,#3a241b);
box-shadow:inset -2px -2px 0 rgba(0,0,0,.3),inset 2px 2px 0 rgba(255,255,255,.1),2px 2px 0 rgba(0,0,0,.45)}
.dn .btn.pri{box-shadow:inset -2px -2px 0 rgba(0,0,0,.26),inset 2px 2px 0 rgba(255,255,255,.42),2px 2px 0 rgba(0,0,0,.5)}
.dn .hpbar{box-shadow:inset 0 2px 0 rgba(0,0,0,.4)}
/* --- 8-bit iconography (original pixel art, no licensed characters) --- */
.dn .card h3[data-icon]:before,.dn .tab[data-tab]:before,.dn .hpnum:before{
content:"";display:inline-block;image-rendering:pixelated;background-repeat:no-repeat;
background-position:center;background-size:contain;flex:none}
.dn .card h3[data-icon]:before{width:15px;height:15px;margin-right:7px;vertical-align:-3px}
.dn .tab[data-tab]:before{width:13px;height:13px;margin-right:6px;vertical-align:-2px;opacity:.75}
.dn .tab.on[data-tab]:before{opacity:1}
.dn .hpnum:before{width:27px;height:27px;margin-right:11px;vertical-align:1px;background-image:${px("heart")}}
${iconRules(".card h3", ["heart", "coin", "star", "shield", "book", "box", "scroll", "fire", "gem", "flag"])}
.dn .tab[data-tab="play"]:before{background-image:${px("heart")}}
.dn .tab[data-tab="build"]:before{background-image:${px("gem")}}
.dn .tab[data-tab="spells"]:before{background-image:${px("star")}}
.dn .tab[data-tab="gear"]:before{background-image:${px("box")}}
.dn .tab[data-tab="notes"]:before{background-image:${px("scroll")}}
/* --- the critter: an original angry brick, drawn for this app --- */
.dn .critter{display:block;width:76px;height:64px;image-rendering:pixelated;
background:center bottom/contain no-repeat url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 10' shape-rendering='crispEdges'><path fill='%236d2f18' d='M1 0h10v1H1z M0 1h1v7H0z M11 1h1v7H11z M1 7h10v1H1z'/><path fill='%23b0532f' d='M1 1h10v6H1z'/><path fill='%237f3a1f' d='M1 4h10v1H1z'/><path fill='%234a1f10' d='M2 1h3v1H2z M7 1h3v1H7z M3 5h6v1H3z'/><path fill='%23f6e8d3' d='M2 2h3v2H2z M7 2h3v2H7z M4 5h1v1H4z M7 5h1v1H7z'/><path fill='%231b1008' d='M3 3h1v1H3z M8 3h1v1H8z'/><path fill='%233a2118' d='M1 8h3v2H1z M8 8h3v2H8z'/></svg>");
animation:waddle .55s ease-in-out infinite alternate}
.dn .critter[data-squash="1"]{background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 10' shape-rendering='crispEdges'><path fill='%236d2f18' d='M0 6h12v4H0z'/><path fill='%23b0532f' d='M1 7h10v2H1z'/><path fill='%231b1008' d='M2 7h1v1H2z M4 7h1v1H4z M7 7h1v1H7z M9 7h1v1H9z M3 8h1v1H3z M8 8h1v1H8z'/><path fill='%233a2118' d='M0 9h2v1H0z M10 9h2v1H10z'/></svg>");animation:splat .32s ease-out}
.dn .critter[data-bite="1"]{animation:lunge .36s ease-out 2}
@keyframes waddle{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes splat{0%{transform:scaleY(1.5)}100%{transform:scaleY(1)}}
@keyframes lunge{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-15px) scale(1.25)}}
.dn .coinpop{display:flex;gap:17px;height:15px}
.dn .coinpop i{width:15px;height:15px;image-rendering:pixelated;opacity:0;
background:center/contain no-repeat ${px("coin")};animation:coinup .9s ease-out forwards}
.dn .coinpop i:nth-child(2){animation-delay:.1s}
.dn .coinpop i:nth-child(3){animation-delay:.2s}
@keyframes coinup{0%{transform:translateY(0);opacity:0}22%{opacity:1}100%{transform:translateY(-64px);opacity:0}}
.dn .die{background-image:
radial-gradient(circle at 10px 10px,rgba(255,255,255,.22) 2px,transparent 2.7px),
radial-gradient(circle at calc(100% - 10px) 10px,rgba(255,255,255,.22) 2px,transparent 2.7px),
radial-gradient(circle at 10px calc(100% - 10px),rgba(255,255,255,.22) 2px,transparent 2.7px),
radial-gradient(circle at calc(100% - 10px) calc(100% - 10px),rgba(255,255,255,.22) 2px,transparent 2.7px)}
`,
  },

  candlelit: {
    name: "Candlelit",
    blurb: "Candlelit indigo, brass and pomegranate, with a papercut scallop under every heading. Rolls land on a spinning dreidel.",
    dot: "#e0a63c",
    vars: {
      ink: "#12152b", pan: "#1c2040", pan2: "#262b52", line: "#3b4278", line2: "#2e3460",
      tx: "#f6ecd8", mut: "#a9a0cc", steel: "#8079ad", brass: "#e0a63c", onbrass: "#221704",
      crim: "#c33c55", verd: "#71a45c", vio: "#9b7fd6",
      rad: "13px", radsm: "9px", pillrad: "999px", bd: "1px",
      font: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
      fontd: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
      trackd: ".015em", h3size: "13.5px",
      btnshadow: "none", cardshadow: "0 2px 18px rgba(0,0,0,.3)",
      statshadow: "inset 0 1px 0 rgba(255,255,255,.05)",
      topbg: "linear-gradient(180deg,#1a1e3c,#151833f2)",
      hpbg: "#2a1a2a", hpfill: "linear-gradient(90deg,#8c2438,#c33c55 55%,#e0a63c)",
      pillon: "#3a2c18",
      danbg: "#3c1c28", danbd: "#6b3145", dantx: "#f0b3c1",
      gdbg: "#1d3524", gdbd: "#3c6141", gdtx: "#b3dcb5",
      wrnbg: "#3a2c18", wrnbd: "#6b5424", wrntx: "#f0d49a",
      scrim: "rgba(8,9,20,.88)",
      diebg: "linear-gradient(180deg,#2c3160,#212549)", diebd: "#e0a63c", dierad: "20px",
      dieshadow: "0 0 30px rgba(224,166,60,.34),inset 0 1px 0 rgba(255,255,255,.1)",
      diceScrim: "rgba(8,9,20,.82)",
      bgimg: "radial-gradient(900px 460px at 50% -180px,rgba(224,166,60,.20),transparent 72%)",
    },
    extra: `
.dn .card{border-top:2px solid rgba(224,166,60,.45)}
.dn .card h3:after{content:"";display:block;height:7px;margin-top:7px;opacity:.6;
background-image:radial-gradient(circle at 6px 7px,var(--brass) 4.5px,transparent 5.5px);
background-size:13px 13px;background-repeat:repeat-x}
.dn .pill{transform:rotate(-.8deg)}
.dn .pill:nth-of-type(even){transform:rotate(.9deg)}
.dn .pill:hover{transform:rotate(0deg)}
.dn .stat{background:linear-gradient(180deg,#2a2f59,#232750)}
.dn .stat:nth-of-type(3n){transform:rotate(-.35deg)}
.dn .stat:nth-of-type(4n){transform:rotate(.3deg)}
.dn .hpnum{text-shadow:0 0 22px rgba(224,166,60,.35)}
.dn .btn.pri{box-shadow:0 0 16px rgba(224,166,60,.3)}
/* a row of teeth along the bottom of the bar */
.dn .top{position:relative}
.dn .top:after{content:"";position:absolute;left:0;right:0;bottom:0;height:6px;pointer-events:none;
background-image:linear-gradient(45deg,var(--ink) 50%,transparent 50%),
linear-gradient(-45deg,var(--ink) 50%,transparent 50%);
background-size:11px 6px;background-repeat:repeat-x}
/* --- the dreidel --- rolls come up on a spinning top instead of a cube. */
.dn .die{width:136px;height:168px;padding-bottom:25px;font-size:46px;color:#f6ecd8;
background:center/contain no-repeat url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 124'><rect x='43' y='2' width='14' height='20' rx='4' fill='%23e0a63c'/><rect x='36' y='18' width='28' height='7' rx='3' fill='%23c88c28'/><rect x='14' y='24' width='72' height='58' rx='9' fill='%232c3160' stroke='%23e0a63c' stroke-width='3'/><path d='M15 80h70l-33 38a3 3 0 0 1-4 0z' fill='%23262b52' stroke='%23e0a63c' stroke-width='3' stroke-linejoin='round'/><path d='M20 30h60' stroke='rgba(255,255,255,.16)' stroke-width='2' stroke-linecap='round'/></svg>");
border:none;border-radius:0;box-shadow:none;filter:drop-shadow(0 0 20px rgba(224,166,60,.34))}
/* A spin read edge-on: the face squeezes to nothing and opens out again. */
.dn .die[data-phase="rolling"]{animation:dreidelspin .62s linear;
font-family:"Arial Hebrew","Adobe Hebrew","Noto Sans Hebrew","Times New Roman",serif}
@keyframes dreidelspin{
0%{transform:translateY(-130px) rotate(-12deg) scaleX(1)}
18%{transform:translateY(0) rotate(5deg) scaleX(.14)}
36%{transform:translateY(0) rotate(-5deg) scaleX(1)}
54%{transform:translateY(0) rotate(5deg) scaleX(.14)}
72%{transform:translateY(0) rotate(-4deg) scaleX(1)}
88%{transform:translateY(0) rotate(3deg) scaleX(.3)}
100%{transform:translateY(0) rotate(0deg) scaleX(1)}}
.dn .die[data-phase="land"],.dn .die[data-phase="crit"]{animation:dreidelsettle .5s ease-out}
@keyframes dreidelsettle{0%{transform:rotate(-11deg)}30%{transform:rotate(8deg)}
55%{transform:rotate(-5deg)}78%{transform:rotate(3deg)}100%{transform:rotate(0deg)}}
.dn .die[data-phase="crit"]{filter:drop-shadow(0 0 26px rgba(113,164,92,.7))}
.dn .die[data-phase="fumble"]{filter:drop-shadow(0 0 24px rgba(195,60,85,.7))}
/* gimel: the pot pays out. */
.dn .coinpop{display:flex;gap:18px;height:17px;margin-top:4px}
.dn .coinpop i{width:17px;height:17px;opacity:0;background:center/contain no-repeat
url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='7.2' fill='%23e0a63c'/><circle cx='8' cy='8' r='5.4' fill='none' stroke='%23221704' stroke-width='.8' opacity='.5'/><path d='M8 4.2l3.3 5.7H4.7z' fill='none' stroke='%23221704' stroke-width='1' stroke-linejoin='round'/><path d='M8 11.8L4.7 6.1h6.6z' fill='none' stroke='%23221704' stroke-width='1' stroke-linejoin='round'/></svg>");
animation:gelt .95s ease-out forwards}
.dn .coinpop i:nth-child(2){animation-delay:.11s}
.dn .coinpop i:nth-child(3){animation-delay:.22s}
@keyframes gelt{0%{transform:translateY(0) rotate(0);opacity:0}
20%{opacity:1}100%{transform:translateY(-70px) rotate(220deg);opacity:0}}
`,
  },
};

// The dreidel shows a Hebrew letter while it spins rather than a number.
export const SPIN_FACES = { candlelit: ["\u05E0", "\u05D2", "\u05D4", "\u05E9"] };

export function themeCss(key) {
  const t = THEMES[key] || THEMES.slate;
  return ".dn{" + Object.entries(t.vars).map(([k, v]) => "--" + k + ":" + v).join(";") + "}" + BASE + t.extra;
}
