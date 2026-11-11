import './mute-auto.mjs'
// 大型犬の散歩 v2 の検証。node verify.mjs（音は出さない。Chromium と WebKit）
import { chromium, webkit } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = Number(process.env.VPORT || 6210)
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
async function open(browser, opts = {}, tutDone = true) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(d => { try { localStorage.clear(); if (d) localStorage.setItem('bd_tut2', '1') } catch (e) {} }, tutDone)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__bdReady, null, { timeout: 20000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('.screen:not(.hidden) *, #hud:not(.hidden) .plates *, #hud:not(.hidden) .treat')) {
    if (el.closest('.hidden') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('.screen:not(.hidden) button, .screen:not(.hidden) a, .screen:not(.hidden) canvas, #bow:not(.hidden), #hud:not(.hidden) .plate, #hud:not(.hidden) .treat')) { if (!el.offsetParent && el.id !== 'bow') continue; const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 台本どおりに進める（時間を止めて n 歩）
const runUntil = (p, cond, max = 60 * 60) => p.evaluate(([cond, max]) => { bd.dbg.pause(true); const f = new Function('w', 'return ' + cond); let i = 0; for (; i < max && !f(bd.w); i++) bd.dbg.step(1); bd.render(); return i }, [cond, max])
// 時間を止めて n 歩進め、その間の me[key] の最大値（実時間の間引き読みだと負荷で山を取り逃す）
const stepPeak = (p, key, n = 60) => p.evaluate(([key, n]) => { bd.dbg.pause(true); let m = 0; for (let i = 0; i < n; i++) { bd.dbg.step(1); m = Math.max(m, bd.w.me[key]) } bd.render(); return +m.toFixed(2) }, [key, n])
const stepN = (p, n) => p.evaluate(n => { bd.dbg.pause(true); bd.dbg.step(n); bd.render() }, n)
// 本物の指（マウス）でなぞる
async function swipe(p, dx, dy, x0 = 195, y0 = 560) {
  await p.mouse.move(x0, y0); await p.mouse.down()
  for (let i = 1; i <= 6; i++) { await p.mouse.move(x0 + dx * i / 6, y0 + dy * i / 6); await p.waitForTimeout(10) }
  await p.mouse.up()
}
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'large']]

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない・読み込み画面が消える', async () => {
  // 準備完了と同時に .done（透明・押せない）を付け、0.5 秒後に要素を外す作り。外すのは後片付けなので、
  // 固定 700ms 待ちで「外れたか」を見ると負荷で落ちる。消えて押せない状態になっているかを見る
  const gone = await p.evaluate(() => { const L = document.getElementById('loading'); return !L || (L.classList.contains('done') && getComputedStyle(L).pointerEvents === 'none') })
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
await t('支援リンクは「作者に犬のおやつをおごる」だけ（任意の文字なし）', async () => {
  const r = await p.evaluate(() => { const a = document.getElementById('tmSupport'); return a ? a.textContent.trim() : '' })
  expect(r === '作者に犬のおやつをおごる', r); return r
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
await t('右へなぞると右の列へ、左へなぞると戻る（指で）', async () => {
  await p.evaluate(() => { bd.start({ seed: 21, only: ['banana'] }); bd.dbg.pause(true) })
  await swipe(p, 90, 0); await stepN(p, 25)
  const a = await p.evaluate(() => ({ lane: bd.w.me.lane, x: +bd.w.me.x.toFixed(2) }))
  await swipe(p, -90, 0); await stepN(p, 25)
  const b = await p.evaluate(() => ({ lane: bd.w.me.lane, x: +bd.w.me.x.toFixed(2) }))
  expect(a.lane === 1 && a.x > 1.2 && b.lane === 0 && Math.abs(b.x) < 0.3, { a, b }); return { a, b }
})
await t('上へなぞると跳ぶ・タップでも跳ぶ・下へなぞるとしゃがむ（指で）', async () => {
  await p.evaluate(() => { bd.start({ seed: 21, only: ['banana'] }); bd.dbg.pause(true) })
  await swipe(p, 0, -90); const up = await stepPeak(p, 'y')
  await stepN(p, 40)
  await p.mouse.click(195, 500); const tap = await stepPeak(p, 'y')
  await stepN(p, 40)
  const d0 = await p.evaluate(() => bd.w.stats.ducks)
  await swipe(p, 0, 90); const duck = await stepPeak(p, 'duck', 20), d1 = await p.evaluate(() => bd.w.stats.ducks)
  await p.evaluate(() => bd.dbg.pause(false))
  expect(up > 0.2 && tap > 0.2 && duck > 0 && d1 === d0 + 1, { up, tap, duck, d0, d1 }); return { up, tap, duck, ducks: d1 - d0 }
})
await t('水たまりの手前で指で上へなぞると跳び越える（当たらない）', async () => {
  await p.evaluate(() => { bd.start({ seed: 31, only: ['puddle'] }); bd.dbg.pause(true) })
  await runUntil(p, "w.obs.some(o => o.kind === 'puddle' && Math.abs(o.x - w.me.x) < 0.7 && o.s - w.me.s < w.v * 0.3 && o.s - w.me.s > 0)", 60 * 30)
  await swipe(p, 0, -90)
  await runUntil(p, "w.obs.some(o => o.kind === 'puddle' && Math.abs(o.x - w.me.x) < 0.7 && o.mePassed) && w.me.y === 0", 60 * 3)
  const r = await p.evaluate(() => { const o = bd.w.obs.find(o => o.kind === 'puddle' && Math.abs(o.x - bd.w.me.x) < 0.7 && o.mePassed); bd.dbg.pause(false); return { passed: !!o, hit: o && o.hit, hits: bd.w.stats.hits, near: bd.w.stats.near } })
  expect(r.passed && !r.hit && r.hits === 0, r); return r
})
await t('何もしないと当たって転び、お辞儀を押さないと「無言」で1.2倍', async () => {
  const r = await p.evaluate(() => { bd.start({ seed: 31, only: ['puddle'] }); bd.dbg.pause(true); let st = new Set(); for (let i = 0; i < 60 * 30 && !bd.w.list.length; i++) { bd.dbg.step(1); st.add(bd.w.me.st) } return { st: [...st], list: bd.w.list.map(x => [x.item, x.base, x.cost, x.grade]) } })
  await p.evaluate(() => bd.dbg.pause(false))
  const [it] = r.list
  expect(r.st.includes('tumble') && r.st.includes('bow') && it && it[3] === 'silent' && it[2] === Math.round(it[1] * 1.2 / 100) * 100, r); return r
})
await t('お辞儀: 一番深い所で指でタップすると「最敬礼」で半額', async () => {
  await p.evaluate(() => { bd.start({ seed: 31, only: ['puddle'] }); bd.dbg.pause(true) })
  await runUntil(p, "w.me.st === 'bow'", 60 * 40)
  await p.evaluate(() => { bd.dbg.slow(0.2); bd.dbg.pause(false) })
  let a = 0
  for (let i = 0; i < 300; i++) { a = await p.evaluate(() => bd.w.me.st === 'bow' && bd.w.bow && !bd.w.bow.grade ? bd.w.me.bowA : -1); if (a > 82 || a < 0) break; await p.waitForTimeout(8) }
  await p.mouse.click(200, 300); await p.waitForTimeout(250)
  const r = await p.evaluate(() => ({ grade: bd.w.stats.bows.at(-1), list: bd.w.list.map(x => [x.item, x.base, x.cost]) }))
  await p.evaluate(() => bd.dbg.slow(1))
  expect(r.grade === 'deep' && r.list.every(([i, b, c]) => c === b / 2), { a, ...r }); return r
})
await t('リード: 真ん中の人を犬と反対側で通ると巻きつく。同じ側なら当たらない', async () => {
  const r = await p.evaluate(() => {
    const out = {}
    for (const same of [false, true]) {
      bd.start({ seed: 40, only: ['walker'] }); bd.dbg.pause(true)
      const o = bd.w.obs[0]
      o.lane = 0; o.x = 0; o.vs0 = 0
      for (let i = 0; i < 60 * 20 && !o.dogPassed; i++) { if (bd.w.dog.lane !== 0 && bd.w.me.lane === 0) bd.input({ move: (same ? 1 : -1) * Math.sign(bd.w.dog.lane) }); bd.dbg.step(1) }
      for (let i = 0; i < 60 * 3 && !o.mePassed; i++) bd.dbg.step(1)
      out[same ? 'same' : 'opposite'] = { sideD: o.sideD, me: bd.w.me.lane, hit: o.hit, why: o.hitWhy || null }
    }
    bd.dbg.pause(false); return out
  })
  expect(r.opposite.hit && r.opposite.why === 'wrap' && !r.same.hit, r); return r
})
await t('耳が立つと犬が横へ飛ぶ。ついて行かないと引っぱられる', async () => {
  const r = await p.evaluate(() => {
    bd.start({ seed: 41, only: ['cat'] }); bd.dbg.pause(true)
    let alert = false, side = 0, bang = false
    for (let i = 0; i < 60 * 30; i++) { bd.dbg.step(1); const dz = bd.w.dog.dart; if (dz && dz.st === 'alert' && !alert) { alert = true; side = dz.side; bd.render(); bang = bd.hud().bang } if (alert && !dz) break }
    bd.dbg.pause(false)
    return { alert, side, bang, yanks: bd.w.stats.yanks }
  })
  expect(r.alert && r.bang && r.yanks >= 1, r); return r
})
await t('ギリギリでよけると「ギリギリ」が出て連続が数えられる', async () => {
  const r = await p.evaluate(() => {
    bd.start({ seed: 42, only: ['sprinkler'] }); bd.dbg.pause(true)
    for (let i = 0; i < 60 * 40 && bd.w.stats.near < 2; i++) {
      const o = bd.w.obs.find(o => !o.mePassed && Math.abs(o.x - bd.w.me.x) < 0.7 && o.s - bd.w.me.s < bd.w.v * 0.22 && o.s - bd.w.me.s > 0)
      if (o && bd.w.me.lane === Math.round(o.x / 1.5)) bd.input({ move: bd.w.me.lane >= 0 ? -1 : 1 })
      bd.dbg.step(1)
    }
    bd.render(); const h = bd.hud(); bd.dbg.pause(false)
    return { near: bd.w.stats.near, chain: bd.w.chain, hits: bd.w.stats.hits, pop: h.near }
  })
  expect(r.near >= 2 && r.chain >= 2 && r.hits === 0 && r.pop, r); return r
})
await t('押している指の上に重なる文字の層は押せない（pointer-events:none）', async () => {
  const r = await p.evaluate(() => ['hud', 'telop', 'hint', 'bang', 'bow', 'near'].map(id => getComputedStyle(document.getElementById(id)).pointerEvents))
  expect(r.every(v => v === 'none'), r); return r
})
await t('遊び中に同時に出る文字は2つまで（下手な bot の通しで計測）', async () => {
  await p.evaluate(() => { bd.start({ seed: 25 }); bd.bot('clumsy', 1) })
  let max = 0, worst = null, seen = 0
  // 文字の消え方は実時間なので見張りは実時間のまま。負荷で bot の進みが遅い時は、文字を4回見るまで延ばす（最大60秒）
  for (let i = 0; i < 400 && (i < 60 || seen <= 3); i++) { await p.waitForTimeout(150); const tx = await p.evaluate(() => bd.texts()); if (tx.length) seen++; if (tx.length > max) { max = tx.length; worst = tx } }
  await p.evaluate(() => bd.bot(null))
  expect(max <= 2 && seen > 3, { max, seen, worst }); return { max, seen }
})
await t('ブラウザでも: 何もしない通しが最悪の判定、上手い bot が最良', async () => {
  const r = await p.evaluate(() => { const out = {}; for (const k of ['idle', 'skilled']) { bd.start({ seed: 31 }); bd.dbg.pause(true); bd.bot(k, 31); for (let i = 0; i < 60 * 200 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); out[k] = { total: bd.w.result.total, rank: bd.w.result.rank, hits: bd.w.result.stats.hits, home: bd.w.result.home, time: Math.round(bd.w.result.time) } } bd.dbg.pause(false); return out })
  expect(r.idle.rank === 4 && !r.idle.home && r.idle.total > r.skilled.total && r.skilled.rank <= 1 && r.skilled.home, r); return r
})
await t('結果の回覧板が描かれ、保存とXの文が出る', async () => {
  await p.evaluate(() => bd.showResult())
  await p.waitForTimeout(500)
  const r = await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return { varc: Math.round(s2 / n - (s / n) ** 2), post: decodeURIComponent(document.getElementById('btnPost').href), png: c.toDataURL().length, support: !!document.getElementById('tmSupport') } })
  expect(r.varc > 300 && /x\.com\/intent\/post/.test(r.post) && /ギリギリ回避/.test(r.post) && r.png > 50000 && r.support, r); return { varc: r.varc, png: r.png }
})
await t('音: 鳴き声・ぶつかる音・おやつ・環境音の呼び出しがある（鳴らさず回数で見る）', async () => {
  const r = await p.evaluate(() => bd.sound())
  expect(r.bark > 0 && (r.splash > 0 || r.thud > 0) && r.pop > 0 && r['loop:amb'] > 0, r); return { bark: r.bark, splash: r.splash, pop: r.pop, amb: r['loop:amb'] }
})
await t('英語に切り替えると英語の文言になる', async () => {
  await p.evaluate(() => document.getElementById('btnTitle').click())
  await p.click('#btnLang')
  const r = await p.evaluate(() => ({ h1: document.querySelector('#title h1').textContent, start: document.querySelector('#btnStart').textContent }))
  await p.click('#btnLang')
  expect(r.h1 === 'Big Dog Walk' && /walk/i.test(r.start), r); return r
})
await t('Chromium: ここまでエラーなし', async () => { expect(p.errs.length === 0, p.errs.slice(0, 4).join('|')) })
await p.close()

// ---- 初回のチュートリアル（指でなぞると次へ進む）
const pt = await open(browser, {}, false)
await t('初回: 物の手前で時間がゆっくりになり、指でなぞると進む（よける、跳ぶ、しゃがむ）', async () => {
  const b = await pt.locator('#btnStart').boundingBox(); await pt.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  const got = []
  for (const [key, dx, dy] of [['swipe', 90, 0], ['jump', 0, -90], ['duck', 0, 90]]) {
    await pt.waitForFunction(k => bd.tut && bd.tut.step === k, key, { timeout: 60000 })   // 案内は実時間で進む作り。負荷で遅い時のため上限を広く
    const h = await pt.evaluate(() => bd.hud().hint)
    await swipe(pt, dx, dy)
    await pt.waitForFunction(() => !bd.tut.step, null, { timeout: 15000 })
    got.push(h)
  }
  const hits = await pt.evaluate(() => bd.w.stats.hits)
  expect(/左右/.test(got[0]) && /跳/.test(got[1]) && /しゃが/.test(got[2]) && hits === 0, { got, hits }); return got
})
await t('初回: 犬と同じ側・耳が立ったらついて行く、の案内が出る', async () => {
  const seen = []
  for (const key of ['side', 'dart']) {
    await pt.waitForFunction(k => bd.tut && bd.tut.step === k, key, { timeout: 60000 })
    seen.push(await pt.evaluate(() => bd.hud().hint))
    await pt.evaluate(() => { const d = bd.w.dog; const goal = d.dart ? d.dart.side : d.lane; if (bd.w.me.lane !== goal) bd.input({ move: Math.sign(goal - bd.w.me.lane) }) })
    await pt.waitForFunction(() => !bd.tut.step, null, { timeout: 30000 })
  }
  expect(/同じ側/.test(seen[0]) && /ついて/.test(seen[1]), seen); return seen
})
await t('初回のあと: もう案内は出ない（覚えている）', async () => {
  await pt.waitForFunction(() => { try { return localStorage.getItem('bd_tut2') === '1' } catch (e) { return true } }, null, { timeout: 30000 }).catch(() => {})
  const r = await pt.evaluate(() => { try { return localStorage.getItem('bd_tut2') } catch (e) { return 'x' } })
  expect(r === '1', r); return r
})
await t('チュートリアル: エラーなし', async () => { expect(pt.errs.length === 0, pt.errs.join('|')) })
await pt.close()

// ---- スマホ縦3サイズ × 全画面で一画面に収まる・3列が画面内
for (const [W, H, name] of SIZES) {
  const q = await open(browser, { viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  const views = {}
  await q.waitForTimeout(400)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#btnHow'); await q.waitForTimeout(200); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` })
  await q.click('#btnOk'); await q.waitForTimeout(300); views.play = await fit(q)
  await q.evaluate(() => { bd.start({ seed: 51 }); bd.dbg.pause(true) })
  await runUntil(q, "w.obs.some(o => !o.mePassed && o.s - w.me.s < 10 && o.s - w.me.s > 6)", 60 * 40)
  const lanes = await q.evaluate(() => [-1, 0, 1].map(l => [bd.laneXY(l, 4), bd.laneXY(l, 18)]))
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`${name}: 3列とも4m先・18m先が画面内に見える`, async () => { expect(lanes.flat().every(xy => xy && xy.x > 4 && xy.x < W - 4 && xy.y > 120 && xy.y < H - 10), lanes); return lanes.map(a => a.map(xy => [Math.round(xy.x), Math.round(xy.y)])) })
  await q.evaluate(() => bd.bot('idle', 1))
  await runUntil(q, "w.me.st === 'bow' && w.bow.t > 0.4", 60 * 60)
  views.bow = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-bow.png` })
  await q.evaluate(() => { for (let i = 0; i < 60 * 200 && bd.w.phase !== 'end'; i++) bd.dbg.step(1); bd.bot(null); bd.showResult() })
  await q.waitForTimeout(400)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${W}x${H} ${v}`, async () => { expect(!r.over.length, r) })
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
await t('WebKit: 指でタップすると跳ぶ・なぞると列が替わる', async () => {
  await wp.evaluate(() => { bd.start({ seed: 21, only: ['banana'] }); bd.dbg.pause(true) })
  await wp.touchscreen.tap(195, 520); const y = await stepPeak(wp, 'y')
  await stepN(wp, 40)
  await swipe(wp, 90, 0); await stepN(wp, 25)
  const lane = await wp.evaluate(() => { const l = bd.w.me.lane; bd.dbg.pause(false); return l })
  expect(y > 0.2 && lane === 1, { y, lane }); return { y: +y.toFixed(2), lane }
})
await t('WebKit: 音を鳴らす操作のあとも無音', async () => { const r = await wp.evaluate(() => window.__muteOk()); expect(r, r) })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
// ---- ページを離れた時の音（2026-11-11 横丁へ移っても BGM が鳴り続けた不具合の再発防止）
await t('WebKit: 裏に回ると BGM と環境音が止まり suspend。戻っても触るまで鳴らない（bfcache の pageshow でも）', async () => {
  const r = await wp.evaluate(async () => {
    if (!Snd.ctx) Snd.init()
    const url = Object.values(Snd.files).flat()[0]; Snd.loop('vtest', url, 0.2)
    for (let i = 0; i < 30 && !Snd.playing().includes('vtest'); i++) await new Promise(r => setTimeout(r, 100))
    const c = Snd.ctx; let sus = 0; const os = c.suspend.bind(c); c.suspend = () => { sus++; return os() }
    const before = Snd.playing().length, wake0 = Snd.life.wake
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
    const hid = { away: Snd.away, playing: Snd.playing().length, sus, gain: Snd.master.gain.value }
    const name = Object.keys(Snd.files)[0], src = Snd.play(name); Snd.loop('vtest2', url, 0.2);    // 裏にいる間の音は鳴らさない
    await new Promise(r => setTimeout(r, 400)); const quiet = Snd.playing().length
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await new Promise(r => setTimeout(r, 400)); const back = { away: Snd.away, playing: Snd.playing().length, gain: Snd.master.gain.value }
    Snd.loop('vtest2', null)
    return { before, wake0, hid, src: src === null, quiet, back }
  })
  // ボタンでない所を1回タップ（触ったら鳴らし直す）
  const pt = await wp.evaluate(() => { for (let y = 0.5; y < 0.98; y += 0.06) for (let x = 0.08; x < 0.95; x += 0.12) { const X = innerWidth * x, Y = innerHeight * y, e = document.elementFromPoint(X, Y); if (e && !e.closest('button,a,input,select,textarea,label,[onclick],[role=button],[tabindex]')) return { x: X, y: Y } } return null })
  if (pt) await wp.touchscreen.tap(pt.x, pt.y); else await wp.keyboard.press('Shift')
  await wp.waitForTimeout(700)
  const after = await wp.evaluate(() => ({ away: Snd.away, playing: Snd.playing().length, wake: Snd.life.wake, mute: window.__muteOk() }))
  await wp.evaluate(() => Snd.loop('vtest', null))
  expect(r.before >= 1 && r.hid.away && r.hid.playing === 0 && r.hid.sus === 1 && r.hid.gain === 0 && r.src && r.quiet === 0 && r.back.away && r.back.playing === 0 && r.back.gain === 0 && !after.away && after.playing >= r.before && after.wake === r.wake0 + 1 && after.mute, JSON.stringify({ r, after, pt })); return { before: r.before, after: after.playing }
})
await t('WebKit: 別のページへ移る（pagehide）と止まり、戻るで戻っても鳴っていない・エラーなし', async () => {
  await wp.evaluate(() => addEventListener('pagehide', () => { try { sessionStorage.setItem('vHide', JSON.stringify({ away: Snd.away, playing: Snd.playing().length, hide: Snd.life.hide })) } catch (e) {} }))
  await wp.evaluate(() => { if (!Snd.ctx) Snd.init(); Snd.loop('vtest', Object.values(Snd.files).flat()[0], 0.2) }); await wp.waitForTimeout(500)
  const pre = await wp.evaluate(() => Snd.playing().length)
  await wp.goto(URL0 + 'privacy.html'); await wp.waitForTimeout(300)
  const hid = await wp.evaluate(() => sessionStorage.getItem('vHide'))
  await wp.goBack(); await wp.waitForFunction(() => window.__bdReady, null, { timeout: 15000 }); await wp.waitForTimeout(800)
  const back = await wp.evaluate(() => ({ playing: typeof Snd === 'undefined' ? 0 : Snd.playing().length, mute: window.__muteOk() }))
  const h = JSON.parse(hid || '{}')
  expect(pre >= 1 && h.away && h.playing === 0 && back.playing === 0 && back.mute && wp.errs.length === 0, JSON.stringify({ pre, h, back, e: wp.errs })); return { pre, h, back }
})
await wb.close()

// ---- bot の分布（Node・音なし）
await t('bot の分布: 何もしないが最悪、上手いが最良', async () => {
  const out = execSync('node sim.mjs 16', { cwd: ROOT, encoding: 'utf8' })
  const line = out.split('\n').find(l => /^OK|^NG/.test(l))
  expect(/^OK/.test(line), line); return line.replace(/^OK: \S+ /, '')
})
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
