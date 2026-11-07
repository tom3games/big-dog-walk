import './mute-auto.mjs'
// SNS 用画像 og.png（1200x630）。引きずられている一番おもしろい瞬間を止めて撮り、右に題名を重ねる。node og.mjs
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname, PORT = 6213
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP', deviceScaleFactor: 1 })
await muteContext(ctx)
await ctx.addInitScript(() => { try { localStorage.setItem('bd_tut', '1') } catch (e) {} })
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady, null, { timeout: 20000 })
await p.waitForTimeout(2500)
const seed = +process.argv[2] || 12
await p.evaluate(seed => {
  bd.start({ seed, only: ['cat'] }); bd.dbg.pause(true)
  for (let i = 0; i < 60 * 40 && !(bd.w.me.st === 'dragged' && bd.w.dog.ev && bd.w.dog.ev.t > 0.75); i++) bd.dbg.step(1)
  bd.render()
  bd.lockCam(true)
  const w = bd.w, cam = bd.camera, d = w.dog, m = w.me
  bd.me().setExpr('busted'); bd.dog().setExpr('alert')
  cam.fov = 40; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix()
  const midS = (d.s + m.s) / 2, side = d.x > 0 ? -1 : 1
  cam.position.set(Math.max(-3.2, Math.min(3.2, d.x + side * 3.6)), 1.6, -(d.s + 3.4))
  cam.lookAt((d.x + m.x) / 2 - side * 1.0, 0.55, -(midS + 0.2))
  document.getElementById('hud').style.display = 'none'
  bd.scene.traverse(o => { if (o.isSprite) o.visible = false })
  bd.renderer.render(bd.scene, cam)
}, seed)
await p.evaluate(() => {
  const o = document.createElement('div')
  o.innerHTML = `<div style="position:fixed;left:24px;top:14px;transform:rotate(-2deg);width:380px;padding:14px 20px 12px!important;background:#f7f5ef;border:8px solid #1f7a4c;border-radius:6px;padding:22px 26px 20px;box-shadow:0 14px 30px rgba(40,20,10,.35);text-align:center;font-family:'BIZ UDPGothic',sans-serif;color:#1d1410">
    <p style="font-size:20px;color:#1f7a4c;letter-spacing:.12em;margin:0">飼い主のみなさまへ</p>
    <h1 style="font-size:54px;line-height:1.1;margin:6px 0 4px;white-space:nowrap">大型犬の散歩</h1>
    <p style="font-size:26px;color:#d4302a;margin:12px 0 0">散歩されているのは、<br>あなたです。</p></div>
    <div style="position:fixed;left:60px;bottom:40px;font-family:'Mochiy Pop One',sans-serif;font-size:60px;color:#fff36b;-webkit-text-stroke:9px #1d1410;paint-order:stroke fill;transform:rotate(-4deg)">顔から行った</div>`
  document.body.appendChild(o)
  for (const id of ['title', 'how', 'result']) document.getElementById(id).classList.add('hidden')
})
await p.waitForTimeout(400)
await p.screenshot({ path: 'og.png' })
await b.close(); server.kill()
console.log('og.png')
