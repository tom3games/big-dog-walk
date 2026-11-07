import './mute-auto.mjs'
// その場の確認用スクショ。node shot.mjs [w] [h]
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
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady, null, { timeout: 15000 })
await p.waitForTimeout(800)
await p.screenshot({ path: 'shots/s-title.png' })
await p.evaluate(() => bd.start({ seed: 5 }))
await p.waitForTimeout(1500)
await p.screenshot({ path: 'shots/s-play.png' })
console.log('info', JSON.stringify(await p.evaluate(() => bd.info())))
// 最初の出来事まで進める
await p.evaluate(() => { bd.dbg.pause(true); for (let i = 0; i < 60 * 30 && !(bd.w.dog.ev && bd.w.dog.ev.st === 'alert' && bd.w.dog.ev.t > 0.6); i++) bd.dbg.step(1); bd.dbg.pause(false) })
await p.evaluate(() => bd.dbg.pause(true)); await p.evaluate(() => bd.render())
await p.screenshot({ path: 'shots/s-alert.png' })
await p.evaluate(() => { for (let i = 0; i < 70; i++) bd.dbg.step(1); bd.render() })
await p.screenshot({ path: 'shots/s-bolt.png' })
console.log(JSON.stringify(await p.evaluate(() => ({ st: bd.w.dog.st, me: bd.w.me.st, ev: bd.w.dog.ev && bd.w.dog.ev.kind, hud: bd.hud() }))))
// お辞儀まで
await p.evaluate(() => { for (let i = 0; i < 60 * 12 && bd.w.phase !== 'bow'; i++) bd.dbg.step(1); for (let i = 0; i < 30; i++) bd.dbg.step(1); bd.render() })
await p.screenshot({ path: 'shots/s-bow.png' })
await p.evaluate(() => { bd.input({ bowOnce: true }); bd.dbg.step(1); bd.input(null); for (let i = 0; i < 20; i++) bd.dbg.step(1); bd.render() })
await p.screenshot({ path: 'shots/s-bow2.png' })
// 巻きつけ
await p.evaluate(() => { bd.start({ seed: 9, only: ['yakiimo', 'wedding'] }); bd.dbg.pause(true); bd.bot('reader', 3); for (let i = 0; i < 60 * 40 && !(bd.w.wrap && bd.w.dog.st === 'bolt' && bd.w.dog.ev.t > 1); i++) bd.dbg.step(1); bd.render() })
await p.screenshot({ path: 'shots/s-wrap.png' })
// 最後まで（reader）→ 結果
await p.evaluate(() => { bd.start({ seed: 11 }); bd.dbg.pause(true); bd.bot('idle', 3); for (let i = 0; i < 60 * 200 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); bd.showResult() })
await p.waitForTimeout(600)
await p.screenshot({ path: 'shots/s-result.png' })
await p.evaluate(() => { document.getElementById('btnTitle').click() }); await p.evaluate(() => document.getElementById('btnHow').click()); await p.waitForTimeout(300)
await p.screenshot({ path: 'shots/s-how.png' })
console.log('errors', errs)
await b.close(); server.kill()
