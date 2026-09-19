import asyncio, json, time
from playwright.async_api import async_playwright
chars=json.load(open("test/two.json")); c=chars["a"]
store={"pf2e-store:dnd5e:index": json.dumps({"ids":[c["id"]],"activeId":c["id"],"theme":"slate","animate":True,"rev":1}),
       "pf2e-store:dnd5e:char:"+c["id"]: json.dumps({"char":c,"rev":1,"at":0})}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width":390,"height":844})
        t0=time.time(); log=lambda *a: print(f"{time.time()-t0:5.2f}s", *a)
        pg.on("console", lambda m: log("console", m.type, m.text[:150]))
        pg.on("pageerror", lambda e: log("pageerror", str(e)[:150]))
        await pg.add_init_script("(s=>{for(const k in s)localStorage.setItem(k,s[k])})(%s)" % json.dumps(store))
        n={"k":0}
        async def h(route):
            n["k"]+=1; log("request", n["k"], route.request.url.split('/')[-1])
            if n["k"]<=4: await route.abort("connectionreset")
            else: await route.continue_()
        await pg.route("**/dnd5e-data-2024.js*", h)
        await pg.goto("http://localhost:8801/index.html")
        await pg.wait_for_selector('button:has-text("Try again")', timeout=10000); log("error screen up")
        await pg.click('button:has-text("Try again")'); log("clicked")
        for i in range(12):
            await pg.wait_for_timeout(500); log("screen:", (await pg.inner_text("body"))[:60].replace("\n"," "))
        log("tabs?", await pg.locator(".tabs").count(), (await pg.inner_text("body"))[:80].replace("\n"," "))
        await b.close()
asyncio.run(main())
