import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width":390,"height":844}, device_scale_factor=2)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(1500)
        await pg.click("text=Import characters from a backup")
        await pg.fill("textarea", open("test/wiz.json").read())
        await pg.click("details button:has-text('Import')"); await pg.wait_for_timeout(800)
        await pg.click("[data-tab=spells]"); await pg.wait_for_timeout(300)
        await pg.screenshot(path="test/sp1.png", full_page=True)
        # add Magic Missile
        await pg.fill("[data-card=addspells] input", "magic missile")
        await pg.click("[data-card=addspells] .skrow button"); await pg.wait_for_timeout(200)
        # cast fireball
        await pg.click("summary:has-text('Fireball')")
        await pg.click("details[open] button:has-text('Cast')"); await pg.wait_for_timeout(300)
        toast = await pg.inner_text(".toast")
        await pg.click("details[open] button:has-text('Roll 8d6')"); await pg.wait_for_timeout(2600)
        # everything view, prepare hold person, upcast at 3rd
        await pg.click("text=Everything")
        await pg.click("summary:has-text('Hold Person') button:has-text('Prepare')")
        await pg.click("summary:has-text('Hold Person') .ttl")
        await pg.select_option("details[open] select", index=1)
        await pg.click("details[open] button:has-text('Cast')"); await pg.wait_for_timeout(300)
        toast2 = await pg.inner_text(".toast")
        await pg.screenshot(path="test/sp2.png", full_page=True)
        print("toast1:", toast); print("toast2:", toast2); print("errors:", errs)
        await b.close()
asyncio.run(main())
