import '../mute-auto.mjs'
// 遊び中の fps を測る（上手い bot で 12 秒走らせる）。node tools/fps.mjs [gpu]
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from '../mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = new URL('..', import.meta.url).pathname, PORT = 6216
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const gpu = process.argv[2] === 'gpu'
const b = await chromium.launch({ ...MUTE_LAUNCH, headless: !gpu ? true : false, args: [...MUTE_LAUNCH.args, ...(gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [])] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP' }); await muteContext(ctx)
await ctx.addInitScript(() => { try { localStorage.setItem('bd_tut2', '1') } catch (e) {} })
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__bdReady)
await p.evaluate(() => { bd.start({ seed: 77 }); bd.bot('skilled', 77) })
const fps = []
for (let i = 0; i < 12; i++) { await p.waitForTimeout(1000); fps.push(await p.evaluate(() => bd.info())) }
console.log(JSON.stringify({ gpu, renderer: await p.evaluate(() => { const g = bd.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' }), fps: fps.map(f => f.fps), calls: Math.max(...fps.map(f => f.calls)), tris: Math.max(...fps.map(f => f.tris)) }))
await b.close(); server.kill()
