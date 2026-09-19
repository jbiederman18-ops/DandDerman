import asyncio, json
from playwright.async_api import async_playwright
chars=json.load(open("test/two.json")); c=chars["a"]
store={"pf2e-store:dnd5e:index": json.dumps({"ids":[c["id"]],"activeId":c["id"],"theme":"slate","animate":True,"rev":1}),
       "pf2e-store:dnd5e:char:"+c["id"]: json.dumps({"char":c,"rev":1,"at":0})}
async def scenario(p, url, fails, label, retry_after=False):
    b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg = await b.new_page(viewport={"width":390,"height":844})
    await pg.add_init_script("(s=>{for(const k in s)localStorage.setItem(k,s[k])})(%s)" % json.dumps(store))
    n={"k":0}
    async def h(route):
        n["k"]+=1
        if n["k"]<=fails: await route.abort("connectionreset")
        else: await route.continue_()
    await pg.route("**/dnd5e-data-2024.js*", h)
    await pg.goto(url)
    try:
        await pg.wait_for_selector(".tabs", timeout=8000); out="sheet opened"
    except Exception:
        txt=(await pg.inner_text("body"))[:90].replace("\n"," ")
        out="no sheet after 8s; screen says: "+txt
        if retry_after and await pg.locator('button:has-text("Try again")').count():
            await pg.click('button:has-text("Try again")')
            try: await pg.wait_for_selector(".tabs", timeout=8000); out+="  → after Try again: sheet opened"
            except Exception: out+="  → Try again didn't help"
    print(f"{label}: {out}  (requests: {n['k']})")
    await b.close()
async def main():
    async with async_playwright() as p:
        await scenario(p,"http://localhost:8802/index.html",1,"OLD, one dropped request")
        await scenario(p,"http://localhost:8801/index.html",1,"NEW, one dropped request")
        await scenario(p,"http://localhost:8801/index.html",4,"NEW, connection down for 4 requests",retry_after=True)
asyncio.run(main())
