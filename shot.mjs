import './mute-auto.mjs'
// その場の確認用スクショ。node shot.mjs [w] [h]（音は出さない）
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname, PORT = 6211
mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const W = +process.argv[2] || 390, H = +process.argv[3] || 844
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', deviceScaleFactor: 2 })
await muteContext(ctx)
await ctx.addInitScript(() => { try { localStorage.setItem('bd_tut2', '1') } catch (e) {} })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady, null, { timeout: 15000 })
await p.waitForTimeout(1500)
await p.screenshot({ path: 'shots/s-title.png' })
const snap = async (name, js) => { await p.evaluate(js); await p.evaluate(() => bd.render()); await p.screenshot({ path: `shots/s-${name}.png` }) }
await p.evaluate(() => { bd.start({ seed: 5 }) }); await p.waitForTimeout(2500)
await p.screenshot({ path: 'shots/s-play.png' })
console.log('info', JSON.stringify(await p.evaluate(() => bd.info())))
const until = (cond, max = 60 * 120) => `(() => { bd.dbg.pause(true); const f = w => (${cond}); let i = 0; for (; i < ${max} && !f(bd.w); i++) bd.dbg.step(1); return i })()`
// 物の手前（いろいろ）
await snap('ahead', until("w.obs.some(o => !o.mePassed && o.s - w.me.s < 9 && o.s - w.me.s > 6 && o.h === 'tall')"))
await snap('tumble', `(() => { bd.bot('idle', 1); ${until("w.me.st === 'tumble' && w.me.st_t > 0.35")}; bd.bot(null) })()`)
await snap('bow', until("w.me.st === 'bow' && w.bow && w.bow.t > 0.42"))
await p.evaluate(() => { bd.start({ seed: 9, only: ['cat', 'yakiimo'] }) })
await snap('alert', until("w.dog.dart && w.dog.dart.st === 'alert' && w.dog.dart.t > 0.6"))
await snap('dart', until("w.dog.dart && w.dog.dart.st === 'go' && w.dog.dart.t > 0.6"))
await p.evaluate(() => { bd.start({ seed: 12, only: ['wedding', 'bar', 'truck', 'cement', 'crow', 'bike', 'pot', 'gate', 'cart', 'sprinkler', 'manhole', 'cat', 'skate', 'banana', 'puddle', 'sign', 'walker', 'pole'] }) })
for (const k of ['wedding', 'bar', 'truck', 'cement', 'crow', 'bike', 'pot', 'gate', 'cart', 'sprinkler', 'manhole', 'cat', 'skate', 'banana', 'puddle', 'sign', 'walker', 'pole']) {
  await snap('ob-' + k, `(() => { bd.bot('skilled', 3); ${until(`w.obs.some(o => o.kind === '${k}' && !o.mePassed && o.s - w.me.s < 7.5 && o.s - w.me.s > 4)`)}; bd.bot(null) })()`)
}
await p.evaluate(() => { bd.start({ seed: 11 }); bd.dbg.pause(true); bd.bot('clumsy', 3); for (let i = 0; i < 60 * 200 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); bd.showResult() })
await p.waitForTimeout(600)
await p.screenshot({ path: 'shots/s-result.png' })
await p.evaluate(() => { document.getElementById('btnTitle').click() }); await p.evaluate(() => document.getElementById('btnHow').click()); await p.waitForTimeout(300)
await p.screenshot({ path: 'shots/s-how.png' })
console.log('errors', errs)
await b.close(); server.kill()
