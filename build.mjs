import * as esbuild from "esbuild";
import fs from "fs";
const r = await esbuild.build({ entryPoints: ["src/main.jsx"], bundle: true, minify: true, write: false, format: "iife",
  external: ["./dnd5e-data.js", "./dnd5e-data-2024.js", "./pdf-lib.js"],
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", target: "es2019" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const shim = fs.readFileSync("src/sync-shim.js", "utf8");

// pdf-lib is over half the app's weight and only the D&D Beyond import uses it, so it lives
// in its own file and downloads the first time someone imports a sheet.
const pdf = await esbuild.build({ stdin: { contents: 'export * from "pdf-lib";', resolveDir: ".", loader: "js" },
  bundle: true, minify: true, write: false, format: "esm", legalComments: "none", target: "es2019" });

// Runs from the <head>, before the big app script has even arrived: find which ruleset the
// open character uses and start that download straight away, so it comes down alongside the
// page instead of after it. The app's import() then picks up the same request.
const early = `(function(){try{var P="pf2e-store:",ix=JSON.parse(localStorage.getItem(P+"dnd5e:index")||"null");
var id=ix&&(ix.activeId||(ix.ids||[])[0]),ch=id&&JSON.parse(localStorage.getItem(P+"dnd5e:char:"+id)||"null");
var sys=ch&&ch.char&&ch.char.system==="2014"?"2014":"2024",l=document.createElement("link");
l.rel="modulepreload";l.href=sys==="2014"?"dnd5e-data.js":"dnd5e-data-2024.js";document.head.appendChild(l)}catch(e){}})();`;
// The favicon and the iOS home-screen icon ride inside the page; the manifest and its two
// larger icons are separate files, because Android won't install from an inline manifest.
const png = (n) => "data:image/png;base64," + fs.readFileSync(`src/icons/icon-${n}.png`).toString("base64");
const icon64 = png(64), icon180 = png(180);

// The page loads three scripts in order: the configuration the sheet reads while it
// boots, the sync layer (which defines window.storage before anything asks for it),
// and the app itself.
const page = (script) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07090e"><title>D&amp;D 5e sheet</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="5e Sheet">
<meta name="mobile-web-app-capable" content="yes">
<script>${early}<\/script>
<link rel="icon" type="image/png" sizes="64x64" href="${icon64}">
<link rel="apple-touch-icon" sizes="180x180" href="${icon180}">
<link rel="manifest" href="manifest.webmanifest">
<style>html,body,#root{margin:0;height:100%;background:#07090e}
#boot{color:#8595aa;font:15px/1.5 -apple-system,system-ui,sans-serif;padding:40px 20px}</style></head>
<body><div id="root"><div id="boot">Loading the sheet\u2026</div></div>
<!-- Includes SRD 5.1 and SRD 5.2 material (CC-BY-4.0, Wizards of the Coast) and Open Game Content (OGL 1.0a); see the data files for full attribution. -->
<script>
  window.PF2E_STANDALONE = true;
  window.PF2E_API_PROXY = "";
  /* Cross-device sync. Leave this blank and the sheet saves to whichever browser you
     opened it in. Fill it in with your own Firebase project \u2014 or paste the setup code
     from a device that already syncs \u2014 and the same characters open everywhere. */
  window.PF2E_FIREBASE = {};
<\/script>
<script>${shim}<\/script>
<script>${script}<\/script></body></html>`;

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", page(js));
for (const f of ["dnd5e-data.js", "dnd5e-data-2024.js", "manifest.webmanifest"]) fs.copyFileSync("src/" + f, "dist/" + f);
for (const n of [192, 512]) fs.copyFileSync(`src/icons/icon-${n}.png`, `dist/icon-${n}.png`);
fs.writeFileSync("dist/pdf-lib.js", pdf.outputFiles[0].text);
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(2) + " MB";
console.log("dist/index.html", mb("dist/index.html"), "| pdf-lib.js", mb("dist/pdf-lib.js"), "| dnd5e-data.js", mb("dist/dnd5e-data.js"), "| dnd5e-data-2024.js", mb("dist/dnd5e-data-2024.js"));

// A second build with the data inlined, for previewing without a web server (dynamic imports
// need one). Note: never assemble this with String.replace — minified code contains $& and $'
// sequences, which a replacement string expands, silently duplicating the whole bundle.
const pdfInline = { name: "pdf-inline", setup(b) { b.onResolve({ filter: /^\.\/pdf-lib\.js$/ }, () => ({ path: "pdf-lib", external: false, namespace: "pdfproxy" }));
  b.onLoad({ filter: /.*/, namespace: "pdfproxy" }, () => ({ contents: 'export * from "pdf-lib";', resolveDir: "." })); } };
const one = await esbuild.build({ entryPoints: ["src/main.jsx"], bundle: true, minify: true, write: false, format: "iife", plugins: [pdfInline],
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", target: "es2019" });
fs.writeFileSync("dist/single-file.html", page(one.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")));
console.log("dist/single-file.html", mb("dist/single-file.html"));
