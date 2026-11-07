// 遊び方ごとの bot（sim.mjs と verify.mjs で使う）。人の速さに合わせて、合図から反応まで REACT 秒遅らせる
import { KINDS, Walk, BOW_T, mulberry32 } from './sim.js?v=1'
const REACT = 0.35
const SHORT = { cat: 1, pigeon: 1 }

export function makeBot(kind, seed = 1) {
  const react = kind === 'slowreader' ? 0.9 : REACT
  const rng = mulberry32(seed * 31 + 7)
  let holdUntil = 0, nextToggle = 0, hold = false, lane = 0, bowAt = null, tapCd = 0, randTap = 0
  return function (w) {
    const inp = { hold: false, lane: null, tap: null, bowTap: false }
    const t = w.t, d = w.dog, ev = d.ev
    // お辞儀: 人の指でねらう（一番深い所 ± ばらつき）
    if (w.phase === 'bow') {
      const b = w.bow
      if (kind === 'idle') return inp
      if (bowAt == null) bowAt = kind === 'random' ? 0.1 + rng() * BOW_T : BOW_T / 2 + (rng() - 0.5) * 0.16
      if (!b.grade && b.t >= bowAt) inp.bowTap = true
      return inp
    }
    bowAt = null
    if (kind === 'idle') return inp
    if (kind === 'pull') { inp.hold = true; return inp }
    if (kind === 'spamwrap') {   // 届く柱は全部巻く
      if (!w.wrap && t > tapCd) { const r = w.reachable(); if (r.length) { inp.tap = r[0].id; tapCd = t + 0.3 } }
      return inp
    }
    if (kind === 'holdread') { inp.hold = !!ev && (ev.st === 'bolt' || ev.t > REACT) && !KINDS[ev.kind].good; return inp }
    if (kind === 'random') {
      if (t >= nextToggle) { hold = rng() < 0.4; nextToggle = t + 0.4 + rng() * 1.8; lane = (rng() * 2 - 1) * 2.2 }
      inp.hold = hold; inp.lane = lane
      if (t > randTap) { randTap = t + 0.6; const r = w.reachable(); if (r.length && rng() < 0.12) inp.tap = r[0].id }
      return inp
    }
    // reader: 合図を見て、短い相手は踏ん張り、長い相手は柱に巻く。財布とマラソンは行かせる
    if (!ev) { inp.lane = 0; return inp }
    const K = KINDS[ev.kind]
    const since = ev.st === 'alert' ? ev.t : ALERT_T + ev.t
    if (since < react) return inp
    if (K.good) { inp.lane = 0; return inp }
    const away = ev.side ? -ev.side * 1.4 : 0
    if (SHORT[ev.kind]) { inp.hold = true; inp.lane = away; return inp }
    // 長い相手: 届く柱があれば巻く。なければ一番近い柱へ寄りつつ踏ん張る
    if (!w.wrap) {
      const r = w.reachable().sort((a, b) => Math.hypot(a.x - w.me.x, a.s - w.me.s) - Math.hypot(b.x - w.me.x, b.s - w.me.s))
      if (r.length && t > tapCd) { inp.tap = r[0].id; tapCd = t + 0.3; return inp }
      const near = w.props.filter(p => p.wrap && p.s > w.me.s - 2 && p.s < w.me.s + 6).sort((a, b) => Math.abs(a.s - w.me.s) - Math.abs(b.s - w.me.s))[0]
      inp.lane = near ? Math.sign(near.x) * 2.2 : away
      inp.hold = true
    }
    return inp
  }
}
const ALERT_T = 1.25

// 1回分を最後まで回す
export function runBot(kind, seed, opts = {}) {
  const w = new Walk(seed, opts), bot = makeBot(kind, seed)
  let n = 0
  while (w.phase !== 'end' && n < 60 * 400) { w.step(bot(w)); w.ev.length = 0; n++ }
  return w.result
}
