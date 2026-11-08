// 遊び方ごとの bot（sim.mjs と verify.mjs で使う）
// skilled: 1.25 秒先まで見て、犬と同じ側を通り、跳ぶ・しゃがむ時を合わせる。お辞儀は深い所
// clumsy: 0.6 秒先しか見ず、3割は犬の側を無視し、1割は見落とす。跳ぶ時もずれる
// idle: 何もしない／jumper: ずっと跳ぶ／random: でたらめ
import { Walk, OB, LX, BOW_T, mulberry32 } from './sim.js?v=2'

const PROF = {
  skilled: { look: 1.25, lead: 0.12, err: 0.03, wrong: 0, bow: 0.05, dartLag: 0.25 },
  clumsy:  { look: 0.6,  lead: 0.12, err: 0.14, wrong: 0.35, bow: 0.2, dartLag: 0.6, miss: 0.1 },
}

export function makeBot(kind, seed = 1) {
  const rng = mulberry32(seed * 31 + 7)
  const P = PROF[kind] || PROF.skilled
  let bowAt = null, cool = 0, nextR = 0
  const wrongFor = new Map(), errFor = new Map(), missFor = new Map()
  return function (w) {
    const inp = { move: 0, jump: false, duck: false, bowTap: false }
    const m = w.me, d = w.dog, t = w.t
    if (m.st === 'bow') {
      if (kind === 'idle' || kind === 'jumper') return inp
      if (bowAt == null) bowAt = kind === 'random' ? 0.1 + rng() * BOW_T : BOW_T / 2 + (rng() - 0.5) * 2 * P.bow
      if (w.bow && !w.bow.grade && w.bow.t >= bowAt) inp.bowTap = true
      return inp
    }
    bowAt = null
    if (kind === 'idle') return inp
    if (kind === 'jumper') { inp.jump = true; return inp }
    if (kind === 'random') {
      if (t > nextR) { nextR = t + 0.25 + rng() * 0.8; const r = rng(); if (r < 0.3) inp.move = rng() < 0.5 ? -1 : 1; else if (r < 0.55) inp.jump = true; else if (r < 0.7) inp.duck = true }
      return inp
    }
    if (m.st !== 'run') return inp
    const v = Math.max(3, w.v)
    const ttr = o => (o.s - m.s - 0.3) / Math.max(1, v - o.vs)
    const xAt = (o, tt) => o.x + o.vx * Math.max(0, tt)
    const near = w.obs.filter(o => { if (o.done || o.mePassed || o.hit || o.s + o.len < m.s - 0.3 || ttr(o) > P.look) return false; if (!missFor.has(o.id)) missFor.set(o.id, rng() < (P.miss || 0)); return !missFor.get(o.id) })
    // 列ごとの「危ない物に着くまでの秒数」（無ければ 9）。巻きつく側も危ないに数える
    const danger = l => {
      let best = 9
      for (const o of near) {
        const tt = ttr(o)
        if (o.h !== 'tall') continue
        if (OB[o.kind].gate && o.st === 'wait' && tt > 0.9) continue
        if (Math.abs(xAt(o, tt) - l * LX) < 0.9 && o.s + o.len - m.s > -0.35) { best = Math.min(best, Math.max(0, tt)); continue }
        if (o.wrap) {
          if (!wrongFor.has(o.id)) wrongFor.set(o.id, rng() < P.wrong)
          if (wrongFor.get(o.id)) continue
          const side = o.dogPassed ? o.sideD : Math.abs(d.x - o.x) > 0.5 ? Math.sign(d.x - o.x) : 0
          if (side && Math.sign(l * LX - o.x) === -side && Math.abs(l * LX - o.x) > 0.5) best = Math.min(best, Math.max(0, tt) + 0.2)
        }
      }
      return best
    }
    const D = { '-1': danger(-1), 0: danger(0), 1: danger(1) }
    // 犬が横へ飛ぶ: 合図を見てついて行く
    let want = null
    const dz = d.dart
    if (dz && ((dz.st === 'alert' && dz.t > P.dartLag) || dz.st === 'go')) want = dz.side
    cool -= 1 / 60
    let target = m.lane
    if (want != null && D[want] > 0.6) target = want
    else if (D[m.lane] < P.look) {
      const opts = [-1, 0, 1].sort((a, b) => (D[b] - D[a]) || (Math.abs(a - m.lane) - Math.abs(b - m.lane)) || (Math.abs(a - d.lane) - Math.abs(b - d.lane)))
      if (D[opts[0]] > D[m.lane]) target = opts[0]
    }
    if (target !== m.lane && cool <= 0) {
      const nx = m.lane + Math.sign(target - m.lane)
      if (nx === target || D[nx] > 0.3 || D[m.lane] < D[nx]) { inp.move = Math.sign(target - m.lane); cool = 0.14 }
    }
    // 跳ぶ・しゃがむ（いる列と、これから入る列を見る）
    const myX = (m.lane + inp.move) * LX
    for (const o of near) {
      const tt = ttr(o)
      if (!errFor.has(o.id)) errFor.set(o.id, (rng() * 2 - 1) * P.err)
      const e = errFor.get(o.id)
      if (Math.abs(xAt(o, tt) - myX) > 0.8) continue
      if (o.h === 'low' && tt < 0.33 - (o.len + 0.5) / (2 * v) + e && tt > -0.05 && m.y <= 0.001) inp.jump = true
      if (o.h === 'high' && tt < 0.26 + e && tt > -0.2) { inp.duck = m.duck <= 0.05; inp.jump = false }
    }
    return inp
  }
}

// 1回分を最後まで回す
export function runBot(kind, seed, opts = {}) {
  const w = new Walk(seed, opts), bot = makeBot(kind, seed)
  let n = 0
  while (w.phase !== 'end' && n < 60 * 400) { w.step(bot(w)); w.ev.length = 0; n++ }
  return w.result
}
