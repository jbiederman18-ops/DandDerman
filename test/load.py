import asyncio, json, time, sys
URL=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8765/index.html"
from playwright.async_api import async_playwright
chars=json.load(open("test/two.json"))
async def run(p, which, net):
    b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ctx = await b.new_context(viewport={"width":390,"height":844})
    pg = await ctx.new_page()
    c = chars[which]
    store = {"pf2e-store:dnd5e:index": json.dumps({"ids":[c["id"]],"activeId":c["id"],"theme":"slate","animate":True,"rev":1}),
             "pf2e-store:dnd5e:char:"+c["id"]: json.dumps({"char":c,"rev":1,"at":0})}
    await pg.add_init_script("(s=>{for(const k in s)localStorage.setItem(k,s[k])})(%s)" % json.dumps(store))
    cdp = await ctx.new_cdp_session(pg)
    if net:
        await cdp.send("Network.emulateNetworkConditions", {"offline":False,"latency":150,"downloadThroughput":1.6e6/8,"uploadThroughput":750e3/8})
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate":4})
    t0=time.time()
    await pg.goto(URL, wait_until="commit")
    await pg.wait_for_selector(".tabs", timeout=120000)
    t1=time.time()
    tim = await pg.evaluate("performance.getEntriesByType('resource').filter(r=>/dnd5e|index/.test(r.name)).map(r=>[r.name.split('/').pop(),Math.round(r.startTime),Math.round(r.responseEnd)])")
    nav = await pg.evaluate("Math.round(performance.getEntriesByType('navigation')[0].responseEnd)")
    print(f"{which} {'slow-phone' if net else 'fast'}: sheet ready after {t1-t0:.1f}s | page downloaded at {nav}ms | {tim}")
    await b.close()
async def main():
    async with async_playwright() as p:
        for net in (True,):
            for w in ("a","b"): await run(p,w,net)
asyncio.run(main())
