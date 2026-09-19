import asyncio
from playwright.async_api import async_playwright
ZEPHYR = """Zephyr Strike
Home » All Spells » Zephyr Strike
Source: Xanathar's Guide to Everything
1st-level transmutation
Casting Time: 1 bonus action
Range: Self
Components: V
Duration: Concentration, up to 1 minute
You move like the wind. Until the spell ends, your movement doesn't provoke opportunity attacks.
Once before the spell ends, you can give yourself advantage on one weapon attack roll on your turn. That attack deals an extra 1d8 force damage on a hit. Whether you hit or miss, your walking speed increases by 30 feet until the end of that turn.
Spell Lists. Ranger
transmutation first ranger
Powered by Wikidot.com"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8801/index.html"); await pg.wait_for_selector("text=Create a character")
        await pg.click("text=Import characters from a backup"); await pg.fill("textarea", open("test/wren.json").read())
        await pg.click("details button:has-text('Import')"); await pg.wait_for_selector(".tabs")
        await pg.click("[data-tab=notes]"); await pg.wait_for_timeout(300)
        names = await pg.eval_on_selector_all("[data-card=missing] > div > .between > div > div:first-child", "e=>e.map(x=>x.textContent)")
        links = await pg.eval_on_selector_all("[data-card=missing] a", "e=>e.map(x=>x.href)")
        print("missing:", names); print("links:", [l for l in links if 'search' not in l])
        await pg.screenshot(path="test/lib1.png", full_page=True)
        # fill in Zephyr Strike by pasting
        row = pg.locator("[data-card=missing] > div").filter(has_text="Zephyr Strike").first
        await row.locator("button:has-text('Fill in')").click()
        await pg.fill("[data-card=missing] textarea >> nth=0", ZEPHYR); await pg.wait_for_timeout(200)
        print("paste note:", await pg.inner_text("[data-card=missing] div:has-text('from the paste') >> nth=-1"))
        await pg.screenshot(path="test/lib2.png", full_page=True)
        await pg.click("[data-card=missing] button:has-text('Save to library')"); await pg.wait_for_timeout(700)
        names2 = await pg.eval_on_selector_all("[data-card=missing] > div > .between > div > div:first-child", "e=>e.map(x=>x.textContent)")
        print("missing after:", names2)
        print("library:", (await pg.inner_text("[data-card=library]"))[:120].replace("\n"," | "))
        # spells tab shows text + dice
        await pg.click("[data-tab=spells]"); await pg.click("summary:has-text('Zephyr Strike')")
        body = await pg.inner_text("details[open]")
        print("spell has text:", "You move like the wind" in body, "| roll button:", "Roll 1d8" in body)
        # reload → library persists
        await pg.reload(); await pg.wait_for_selector(".tabs"); await pg.click("[data-tab=notes]"); await pg.wait_for_timeout(300)
        print("after reload, library:", (await pg.inner_text("[data-card=library] .ttl")))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
