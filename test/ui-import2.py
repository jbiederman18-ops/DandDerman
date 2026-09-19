import asyncio, sys
from playwright.async_api import async_playwright
async def main(url):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width":390,"height":844})
        msgs=[]; pg.on("pageerror", lambda e: msgs.append("pageerror "+str(e)[:200])); pg.on("console", lambda m: msgs.append(m.type+" "+m.text[:200]))
        await pg.goto(url); await pg.wait_for_selector("text=Create a character")
        await pg.set_input_files("input[type=file]", "test/sample-ddb.pdf")
        await pg.wait_for_timeout(5000)
        card = await pg.locator(".skrow:has-text(\"Armor Class\")").first.inner_text() + " / " + (await pg.locator("text=Armor Class set to").count() and "hand-set AC" or "no hand-set AC")
        print(url.split(':')[2][:4], "|", card.replace("\n"," | ")[-300:], "|", msgs)
        await b.close()
asyncio.run(main(sys.argv[1]))
