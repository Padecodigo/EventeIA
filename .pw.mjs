import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const jar = JSON.parse(readFileSync(".ck.json","utf8"));
mkdirSync("shots2",{recursive:true});
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, locale:"pt-BR" });
await ctx.addCookies(jar.map(c=>({name:c.name,value:c.value,domain:"eventeia.com.br",path:"/"})));
const p = await ctx.newPage();
for (const [name, url] of [["comprar","https://eventeia.com.br/creditos"],["planos","https://eventeia.com.br/planos"]]) {
  const resp = await p.goto(url,{waitUntil:"networkidle",timeout:60000});
  console.log(name, resp.status(), p.url());
  await p.screenshot({path:`shots2/${name}.png`,fullPage:true});
  const t = await p.textContent("body").catch(()=>"");
  console.log("  texto:", t.slice(0,180).replace(/\s+/g," "));
}
await b.close();
