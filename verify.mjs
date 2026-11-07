import './mute-auto.mjs'
// 大型犬の散歩の検証。node verify.mjs（音は出さない。Chromium と WebKit）
import { chromium, webkit } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 6210
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${String(e.message).split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}, keepStorage = false) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  if (!keepStorage) await ctx.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('bd_tut', '1') } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__bdReady, null, { timeout: 20000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('.screen:not(.hidden) *, #hud:not(.hidden) .plates *')) {
    if (el.closest('.hidden') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) a, .screen:not(.hidden) canvas, #bow:not(.hidden), #hud:not(.hidden) .plate')) { if (!el.offsetParent && el.id !== 'bow') continue; const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 台本どおりに進める（時間を止めて n 歩）
const runUntil = (p, cond, max = 60 * 60) => p.evaluate(([cond, max]) => { const f = new Function('w', 'return ' + cond); let i = 0; for (; i < max && !f(bd.w); i++) bd.dbg.step(1); bd.render(); return i }, [cond, max])
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'large']]

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない・読み込み画面が消える', async () => {
  await p.waitForTimeout(700)
  const gone = await p.evaluate(() => !document.getElementById('loading'))
  expect(p.errs.length === 0 && gone, p.errs.join('|') + ' loading=' + gone)
})
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式がある・og.png が 1200x630', async () => {
  const r = await p.evaluate(async () => {
    const tags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]'))
    const img = new Image(); img.src = 'og.png'; await img.decode().catch(() => {})
    return { tags, w: img.naturalWidth, h: img.naturalHeight }
  })
  expect(r.tags.every(Boolean) && r.w === 1200 && r.h === 630, r); return r
})
await t('画面に「AI」「画像生成」の文字が無い（日英の文言すべて）', async () => {
  const r = await p.evaluate(() => { const s = JSON.stringify(window.BD_TEXT, (k, v) => typeof v === 'function' ? String(v) : v) + document.body.innerText; return /(^|[^A-Za-z])AI([^A-Za-z]|$)|画像生成/.test(s) })
  expect(!r, 'found')
})

// ---- 本物の指（マウス）で操作する
await t('タイトルの「散歩に出る」を押すと遊びが始まる', async () => {
  const b = await p.locator('#btnStart').boundingBox()
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await p.waitForTimeout(400)
  const r = await p.evaluate(() => ({ mode: bd.mode, hud: !document.getElementById('hud').classList.contains('hidden') }))
  expect(r.mode === 'play' && r.hud, r)
})
await t('Chromium: 実際には無音（始めるを押したあと）', async () => { const r = await p.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls })); expect(r.ok, r); return r })
await t('なぞる: 右へスワイプで横に寄る（踏ん張りにはならない）', async () => {
  await p.evaluate(() => bd.start({ seed: 21, only: ['yakiimo'] }))
  await p.waitForTimeout(300)
  const x0 = await p.evaluate(() => bd.w.me.x)
  await p.mouse.move(195, 600); await p.mouse.down()
  for (let i = 1; i <= 8; i++) { await p.mouse.move(195 + i * 18, 600); await p.waitForTimeout(12) }
  const mid = await p.evaluate(() => bd.w.me.st)
  await p.mouse.up(); await p.waitForTimeout(900)
  const r = await p.evaluate(() => ({ lane: bd.w.me.lane, x: bd.w.me.x, st: bd.w.me.st, sit: bd.w.dog.sit }))
  expect(r.lane > 0.8 && r.x > x0 + 0.5 && mid !== 'hold' && r.sit < 0.5, { ...r, x0, mid }); return { lane: +r.lane.toFixed(2), dx: +(r.x - x0).toFixed(2) }
})
await t('押しっぱなし: 踏ん張りになり、何も来ていない時は犬が座る。離すと歩きに戻る', async () => {
  await p.mouse.move(195, 560); await p.mouse.down(); await p.waitForTimeout(1300)
  const a = await p.evaluate(() => ({ st: bd.w.me.st, sit: bd.w.dog.sit, vs: bd.w.dog.vs }))
  await p.mouse.up(); await p.waitForTimeout(900)
  const b = await p.evaluate(() => ({ st: bd.w.me.st, sit: bd.w.dog.sit }))
  expect(a.st === 'hold' && a.sit > 0.5 && b.st === 'walk' && b.sit < 0.5, { a, b }); return { a, b }
})
await t('押しっぱなし中の全力の引きは約2秒で限界になり、顔から引きずられる', async () => {
  await p.evaluate(() => { bd.start({ seed: 21, only: ['yakiimo'] }); bd.dbg.pause(true) })
  await runUntil(p, "w.dog.ev && w.dog.ev.st === 'alert' && w.dog.ev.t > 0.3", 60 * 40)
  await p.evaluate(() => bd.dbg.pause(false))
  await p.mouse.move(195, 560); await p.mouse.down()
  const log = []
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(250); log.push(await p.evaluate(() => [bd.w.me.st, +bd.w.me.grip.toFixed(2), bd.w.dog.st])) }
  await p.mouse.up()
  const held = log.filter(l => l[0] === 'hold' && l[2] === 'bolt').length, dragged = log.some(l => l[0] === 'dragged'), fi = log.findIndex(l => l[0] === 'dragged'), gripAtFall = fi > 0 ? log[fi - 1][1] : 1
  expect(held >= 4 && dragged && gripAtFall < 0.15, log); return { heldSamples: held, dragged, gripAtFall }
})
await t('光る電柱を指でタップすると巻きつく（画面座標で押す）', async () => {
  await p.evaluate(() => { bd.start({ seed: 22, only: ['yakiimo'] }); bd.dbg.pause(true) })
  await runUntil(p, "w.dog.ev && w.dog.ev.st === 'alert' && w.reachable().length > 0", 60 * 40)
  await p.evaluate(() => { bd.dbg.slow(0.15); bd.dbg.pause(false) })
  await p.waitForTimeout(250)
  const r = await p.evaluate(() => bd.reachable())
  expect(r.length && r[0].xy, r)
  const { x, y } = r[0].xy
  expect(x > 0 && x < 390 && y > 0 && y < 844, { x, y })
  await p.mouse.click(x, y); await p.waitForTimeout(300)
  const w = await p.evaluate(() => ({ wrap: !!bd.w.wrap, id: bd.w.wrap && bd.w.wrap.prop.id, st: bd.w.me.st }))
  await p.evaluate(() => bd.dbg.slow(1))
  expect(w.wrap && w.id === r[0].id, { w, r }); return { pole: r[0].kind, at: [Math.round(x), Math.round(y)] }
})
await t('巻いている間は焼き芋屋に届かず、去ったら自動でほどける', async () => {
  await p.evaluate(() => bd.dbg.pause(true))
  const r = await p.evaluate(() => { for (let i = 0; i < 60 * 10 && bd.w.dog.ev; i++) bd.dbg.step(1); const ev = bd.w.events[0]; for (let i = 0; i < 120; i++) bd.dbg.step(1); return { reached: ev.reached, wrap: !!bd.w.wrap, pend: bd.w.pending.length, list: bd.w.list.length } })
  await p.evaluate(() => bd.dbg.pause(false))
  expect(!r.reached && !r.wrap && r.list === 0, r); return r
})
await t('遠い電柱をタップしても巻けない', async () => {
  const r = await p.evaluate(() => { bd.start({ seed: 23, only: ['cat'] }); const far = bd.w.props.find(q => q.wrap && q.s > 40); const before = !!bd.w.wrap; bd.w.doWrap(far); return { before, after: !!bd.w.wrap } })
  expect(!r.after, r)
})
await t('お辞儀: 一番深い所で指でタップすると「最敬礼」で半額', async () => {
  await p.evaluate(() => { bd.start({ seed: 24, only: ['cat'] }); bd.dbg.pause(true) })
  await runUntil(p, "w.phase === 'bow'", 60 * 40)
  await p.evaluate(() => { bd.dbg.slow(0.25); bd.dbg.pause(false) })
  let a = 0
  for (let i = 0; i < 200; i++) { a = await p.evaluate(() => bd.w.phase === 'bow' && bd.w.bow && !bd.w.bow.grade ? bd.w.me.bowA : -1); if (a > 82 || a < 0) break; await p.waitForTimeout(8) }
  await p.mouse.click(200, 300)
  await p.waitForTimeout(250)
  const r = await p.evaluate(() => ({ grade: bd.w.stats.bows.at(-1), list: bd.w.list.map(x => [x.item, x.base, x.cost]) }))
  await p.evaluate(() => bd.dbg.slow(1))
  expect(r.grade === 'deep' && r.list.every(([i, b, c]) => c === b / 2), { a, ...r }); return r
})
await t('お辞儀: 押さないと「無言」で1.2倍', async () => {
  const r = await p.evaluate(() => { bd.start({ seed: 24, only: ['cat'] }); bd.dbg.pause(true); for (let i = 0; i < 60 * 60 && !(bd.w.list.length); i++) bd.dbg.step(1); return { grade: bd.w.stats.bows.at(-1), list: bd.w.list.map(x => [x.base, x.cost]) } })
  await p.evaluate(() => bd.dbg.pause(false))
  expect(r.grade === 'silent' && r.list.every(([b, c]) => c === Math.round(b * 1.2 / 100) * 100), r); return r
})
await t('押している指の上に重なる文字の層は押せない（pointer-events:none）', async () => {
  const r = await p.evaluate(() => ['hud', 'telop', 'hint', 'bang', 'bow'].map(id => getComputedStyle(document.getElementById(id)).pointerEvents))
  expect(r.every(v => v === 'none'), r); return r
})
await t('遊び中に同時に出る文字は2つまか（通しで計測）', async () => {
  await p.evaluate(() => { bd.start({ seed: 25 }); bd.dbg.pause(true); bd.bot('idle', 1); for (let i = 0; i < 60 * 30 && !bd.w.dog.ev; i++) bd.dbg.step(1); bd.dbg.pause(false) })
  let max = 0, worst = null, seen = 0
  for (let i = 0; i < 50; i++) { await p.waitForTimeout(150); const tx = await p.evaluate(() => bd.texts()); if (tx.length) seen++; if (tx.length > max) { max = tx.length; worst = tx } }
  await p.evaluate(() => bd.bot(null))
  expect(max <= 2 && seen > 3, { max, seen, worst }); return { max, seen }
})

// ---- 遊び方ごとの通し（ブラウザでも同じ計算か）
await t('何もしない通しは最悪の判定（お詫びが一番多い）', async () => {
  const r = await p.evaluate(() => { const out = {}; for (const k of ['idle', 'reader']) { bd.start({ seed: 31 }); bd.dbg.pause(true); bd.bot(k, 31); for (let i = 0; i < 60 * 260 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); out[k] = { total: bd.w.result.total, rank: bd.w.result.rank, bad: bd.w.result.bad, home: bd.w.result.home } } bd.dbg.pause(false); return out })
  expect(r.idle.rank >= 3 && r.idle.total > r.reader.total && r.reader.rank <= 1, r); return r
})
await t('結果の回覧板が描かれ、保存とXの文が出る', async () => {
  await p.evaluate(() => bd.showResult())
  await p.waitForTimeout(500)
  const r = await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return { varc: Math.round(s2 / n - (s / n) ** 2), post: document.getElementById('btnPost').href, png: c.toDataURL().length, support: !!document.getElementById('tmSupport') } })
  expect(r.varc > 300 && /x\.com\/intent\/post/.test(r.post) && r.png > 50000 && r.support, r); return { varc: r.varc, png: r.png }
})
await t('音: 犬の鳴き声・壊れる音・環境音が鳴る呼び出しがある（鳴らさず回数で見る）', async () => {
  const r = await p.evaluate(() => bd.sound())
  expect(r.bark > 0 && r.burst > 0 && (r.pot > 0 || r.metal > 0) && r['loop:amb'] > 0, r); return { bark: r.bark, burst: r.burst, pot: r.pot, amb: r['loop:amb'] }
})
await t('英語に切り替えると英語の文言になる', async () => {
  await p.evaluate(() => document.getElementById('btnTitle').click())
  await p.click('#btnLang')
  const r = await p.evaluate(() => ({ h1: document.querySelector('#title h1').textContent, start: document.querySelector('#btnStart').textContent }))
  await p.click('#btnLang')
  expect(r.h1 === 'Big Dog Walk' && /walk/i.test(r.start), r); return r
})
await t('初回はチュートリアルが遊びの中で出る（なぞる→踏ん張る）', async () => {
  const r = await p.evaluate(() => { bd.startTut({ seed: 2 }); const a = bd.hud().hint; bd.dbg.pause(true); for (let i = 0; i < 60 * 30 && !(bd.w.dog.ev && bd.w.dog.ev.st === 'alert'); i++) bd.dbg.step(1); for (let i = 0; i < 3; i++) bd.dbg.step(1); const b = bd.hud().hint; bd.dbg.pause(false); return { a, b } })
  expect(/なぞ/.test(r.a) && /押しっぱなし/.test(r.b), r); return r
})
await t('Chromium: ここまでエラーなし', async () => { expect(p.errs.length === 0, p.errs.slice(0, 4).join('|')) })
await p.close()

// ---- スマホ縦3サイズ × 全画面で一画面に収まる・押す物が画面内
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const views = {}
  await q.waitForTimeout(400)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#btnHow'); await q.waitForTimeout(200); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` })
  await q.click('#btnOk'); await q.waitForTimeout(300); views.play = await fit(q)
  await q.evaluate(() => { bd.start({ seed: 41, only: ['yakiimo', 'cat'] }); bd.dbg.pause(true) })
  await runUntil(q, "w.dog.ev && w.dog.ev.st === 'alert' && w.reachable().length > 0", 60 * 40)
  const poles = await q.evaluate(() => bd.reachable().map(r => r.xy))
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`${name}: 届く電柱が画面内に見える`, async () => { expect(poles.length && poles.every(xy => xy && xy.x > 8 && xy.x < w - 8 && xy.y > 60 && xy.y < h - 20), poles); return poles.map(xy => [Math.round(xy.x), Math.round(xy.y)]) })
  await runUntil(q, "w.phase === 'bow' && w.bow.t > 0.4", 60 * 60)
  views.bow = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-bow.png` })
  await q.evaluate(() => { bd.bot('idle', 1); for (let i = 0; i < 60 * 260 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); bd.showResult() })
  await q.waitForTimeout(400)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始まり、実際には無音', async () => {
  const b = await wp.locator('#btnStart').boundingBox()
  await wp.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await wp.waitForTimeout(500)
  const r = await wp.evaluate(() => ({ mode: bd.mode, ok: window.__muteOk(), calls: window.__soundCalls }))
  expect(r.mode === 'play' && r.ok, r); return r
})
await t('WebKit: 光る電柱を指でタップすると巻きつく', async () => {
  await wp.evaluate(() => { bd.start({ seed: 22, only: ['yakiimo'] }); bd.dbg.pause(true) })
  await runUntil(wp, "w.dog.ev && w.dog.ev.st === 'alert' && w.reachable().length > 0", 60 * 40)
  await wp.evaluate(() => { bd.dbg.slow(0.15); bd.dbg.pause(false) }); await wp.waitForTimeout(200)
  const r = await wp.evaluate(() => bd.reachable())
  await wp.touchscreen.tap(r[0].xy.x, r[0].xy.y); await wp.waitForTimeout(300)
  const ok = await wp.evaluate(() => !!bd.w.wrap); await wp.evaluate(() => bd.dbg.slow(1))
  expect(ok, r)
})
await t('WebKit: 音を鳴らす操作のあとも無音', async () => { const r = await wp.evaluate(() => window.__muteOk()); expect(r, r) })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()

// ---- bot の分布（Node・音なし）
await t('bot の分布: 何もしないが最悪、合図を読むが最良', async () => {
  const out = execSync('node sim.mjs 16', { cwd: ROOT, encoding: 'utf8' })
  const line = out.split('\n').find(l => /^OK|^NG/.test(l))
  expect(/^OK/.test(line), line); return line.replace(/^OK: \S+ /, '')
})
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
