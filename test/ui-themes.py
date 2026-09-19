import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        pg = await b.new_page(viewport={"width":375,"height":800})
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(1200)
        await pg.click("text=Create a character"); await pg.wait_for_timeout(400)
        await pg.click("[aria-label='Change theme']"); await pg.wait_for_timeout(200)
        names = await pg.eval_on_selector_all(".sheetin .opt strong", "els=>els.map(e=>e.textContent)")
        for n in names:
            await pg.click(f".sheetin .opt:has-text('{n}')"); await pg.wait_for_timeout(150)
            w = await pg.eval_on_selector(".tabs", "e=>[e.scrollWidth,e.clientWidth]")
            print(n, w, "fits" if w[0]<=w[1] else "OVERFLOWS")
        await b.close()
asyncio.run(main())
