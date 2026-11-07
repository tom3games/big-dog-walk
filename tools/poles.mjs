import '../mute-auto.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT=import.meta.dirname + '/..', PORT=6214
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addInitScript(() => { try { localStorage.setItem('bd_tut', '1') } catch (e) {} })
const p = await ctx.newPage(); await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady)
const out = await p.evaluate(() => {
  const res = []
  for (const seed of [41, 42, 43, 44, 45, 46, 47, 48, 49, 50]) {
    bd.start({ seed, only: ['yakiimo', 'cat'] }); bd.dbg.pause(true)
    for (let i = 0; i < 60 * 40 && !(bd.w.dog.ev && bd.w.dog.ev.st === 'alert' && bd.w.reachable().length > 0); i++) bd.dbg.step(1)
    bd.render()
    const w = bd.w
    res.push({ seed, me: [w.me.x.toFixed(2), w.me.s.toFixed(1)], dog: [w.dog.x.toFixed(2), w.dog.s.toFixed(1)], cam: bd.cam().map(v => v.toFixed(2)), poles: bd.reachable().map(r => ({ x: bd.w.props[r.id].x, ahead: (bd.w.props[r.id].s - w.me.s).toFixed(1), sx: Math.round(r.xy.x) })) })
  }
  return res
})
console.log(JSON.stringify(out, null, 0).replace(/\},\{"seed/g, '}\n{"seed'))
await b.close(); server.kill()
