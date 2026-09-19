import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width":390,"height":844})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        reqs=[]; pg.on("request", lambda r: reqs.append(r.url.split('/')[-1]))
        await pg.goto("http://localhost:8801/index.html"); await pg.wait_for_selector("text=Create a character")
        print("pdf-lib fetched before import?", "pdf-lib.js" in reqs)
        await pg.set_input_files("input[type=file]", "test/sample-ddb.pdf")
        await pg.wait_for_timeout(4000)
        print("reqs:", reqs[-5:]); print("screen:", (await pg.inner_text("body"))[:600]); print("errs", errs)
        print("pdf-lib fetched on import?", "pdf-lib.js" in reqs)
        print((await pg.inner_text(".card"))[:400])
        await pg.click("button:has-text('Add Brenna')"); await pg.wait_for_selector(".tabs")
        print("AC pill:", await pg.inner_text("[title='Armor Class']"), "| errors:", errs)
        await b.close()
asyncio.run(main())
