import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// 遊びの通しは「散歩に出る」のあと上手い bot で最後まで、回覧板まで
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る（2026-11-02 live.mjs に名前が文字で入ったまま5本公開していた）
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/big-dog-walk/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__bdReady, null, { timeout: 15000 })
  // ---- 遊びの通し（タイトル、遊ぶ、結果）
  await p.evaluate(() => { try { localStorage.setItem('bd_tut2', '1') } catch (e) {} })
  const sb = await p.locator('#btnStart').boundingBox()
  if (bt === webkit) await p.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2); else await p.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await p.waitForTimeout(600)
  const flow = await p.evaluate(() => { const m = bd.mode; bd.start({ seed: 5 }); bd.dbg.pause(true); bd.bot('skilled', 5); for (let i = 0; i < 60 * 200 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); bd.showResult(); return { m, total: bd.w.result.total, home: bd.w.result.home, mute: window.__muteOk() } })
  await p.waitForTimeout(500)
  out.push(`${name}: flow=${JSON.stringify(flow)}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/big-dog-walk', 'https://github.com/tom3games/big-dog-walk/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
