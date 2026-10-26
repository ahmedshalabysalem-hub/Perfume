// Debug only: opens pages in Chromium and counts full navigations and HMR messages.
import { chromium } from "@playwright/test";
const pages = ["/en", "/ar/login"];
const browser = await chromium.launch();
for (const path of pages) {
  const page = await browser.newPage();
  let navs = 0;
  const hmr = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navs++;
  });
  page.on("websocket", (ws) =>
    ws.on("framereceived", (d) => {
      const s = String(d.payload);
      if (s.startsWith("{")) hmr.push(s.slice(0, 300));
    }),
  );
  await page.goto("http://localhost:3000" + path);
  await page.waitForTimeout(20000);
  console.log(`PAGE ${path} NAVIGATIONS ${navs}`);
  for (const m of hmr.slice(0, 15)) console.log("  HMR<", m);
  await page.close();
}
await browser.close();
