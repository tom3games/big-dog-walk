import '../mute-auto.mjs'
// 見せ場を台本どおりに止めて撮る。node tools/gallery.mjs
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from '../mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname + '/..', PORT = 6212
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady, null, { timeout: 15000 })
await p.waitForFunction(() => Object.keys(window.bd && 1 ? {} : {}).length === 0)
await p.waitForTimeout(1500)
// cond: 止める条件（w を受け取る式）。input: 押しっぱなし等
const scene = async (name, opts, cond, input, bot) => {
  await p.evaluate(([opts, cond, input, bot]) => {
    bd.start(opts); bd.dbg.pause(true); bd.input(input); bd.bot(bot)
    const f = new Function('w', 'return ' + cond)
    for (let i = 0; i < 60 * 120 && !f(bd.w); i++) bd.dbg.step(1)
    bd.input(null); bd.bot(null); bd.render(); bd.render()
  }, [opts, cond, input, bot])
  await p.screenshot({ path: `${ROOT}/shots/g-${name}.png` })
}
await scene('hold', { seed: 4, only: ['yakiimo'] }, "w.dog.st === 'bolt' && w.dog.ev.t > 0.9", null, 'holdread')
await scene('sit', { seed: 4, only: ['yakiimo'] }, "w.dog.sit > 0.9 && w.t > 3", { hold: true, lane: 0 })
await scene('dragged', { seed: 4, only: ['cat'] }, "w.me.st === 'dragged' && w.dog.ev && w.dog.ev.t > 0.5", null)
await scene('wrap', { seed: 6, only: ['wedding'] }, "w.wrap && w.dog.st === 'bolt' && w.dog.ev.t > 1.2", null, 'reader')
await scene('wedding', { seed: 6, only: ['wedding'] }, "w.dog.st === 'proud' && w.dog.st_t > 0.3", null)
await scene('yakiimo', { seed: 8, only: ['yakiimo'] }, "w.dog.st === 'proud' && w.dog.st_t > 0.2", null)
await scene('pigeon', { seed: 3, only: ['pigeon'] }, "w.dog.st === 'bolt' && w.dog.ev.t > 0.8", null)
await scene('jogger', { seed: 3, only: ['jogger'] }, "w.stranger && w.stranger.t > 0.4", null)
await scene('wallet', { seed: 3, only: ['wallet'] }, "w.dog.ev && w.dog.ev.st === 'alert' && w.dog.ev.t > 0.8", null)
await scene('marathon', { seed: 3, only: ['marathon'] }, "w.dog.ev && w.dog.ev.st === 'bolt' && w.dog.ev.t > 2.5", null)
await scene('skate', { seed: 3, only: ['cat'], skate: 0, skateAt: 23 }, "w.me.skate && w.me.st_t > 0.4", null)
await scene('home', { seed: 3, only: ['cat'] }, "w.phase === 'end'", null, 'reader')
await p.evaluate(() => { bd.startTut({ seed: 2 }); bd.dbg.pause(true); for (let i = 0; i < 60 * 30 && !(bd.w.dog.ev && bd.w.dog.ev.st === 'alert'); i++) bd.dbg.step(1); bd.render() })
await p.waitForTimeout(200); await p.screenshot({ path: `${ROOT}/shots/g-tut-hold.png` })
console.log('errors', errs)
await b.close(); server.kill()
