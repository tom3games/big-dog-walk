// 大型犬の散歩: 遊びの計算（DOM と three.js に触らない。Node の sim.mjs でも同じ計算で bot を回す）
// 座標: x = 横（右が+、m）、s = 家までの道のり（前が+、m）。固定 60Hz で step(input) を呼ぶ
// リードは2本立て: 手と首輪の「最大距離」の拘束で力を決め（巻きつけ中は 手-柱 と 柱-首輪 の2本）、
// 見た目の綱は Verlet の鎖（rope）で垂れ・巻きつきを描く
export const STEP = 1 / 60
export const ROUTE = 236          // 家までの道のり（m）
export const LIMIT = 180          // 夕飯まで（秒）
export const LEASH = 4.0          // リードの長さ（m）
export const LANE = 2.7           // 人と犬が歩ける幅の半分（塀は 3.6）
export const REACH = 3.7          // 柱に巻きつけられる距離（手から）
export const ALERT = 1.25         // 耳が立ってから走り出すまで
export const GRIP = 2.1           // 全力で引かれて踏ん張れる秒数
const POLE_X = 2.85
// 調整値（sim.mjs から書き換えて分布を見る）
export const T = { holdIm: 0.35, holdFric: 1, holdAcc: 9, tripV: 3.2, tripT: 0.3, reel: 3.2 }

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const hyp = Math.hypot

// 犬が飛びつく相手。pres = 走り出してから相手が去るまで（秒）。長いほど踏ん張りだけでは持たない
// victim = 着いた時に壊すもの（持ち主・品・金額）
export const KINDS = {
  cat:      { pres: 1.75, speed: 6.6, dist: [7.5, 9],  victim: { who: 'suzuki', item: 'pots', cost: 8000 } },
  pigeon:   { pres: 1.6,  speed: 6.4, dist: [7, 8.5],  victim: { who: 'sato', item: 'bikes', cost: 12000 }, center: true },
  smalldog: { pres: 3.3,  speed: 6.6, dist: [8, 9.5],  victim: { who: 'madam', item: 'eggs', cost: 5000 }, moving: -0.9 },
  yakiimo:  { pres: 5.2,  speed: 6.9, dist: [8.5, 10], victim: { who: 'imo', item: 'oven', cost: 15000 } },
  jogger:   { pres: 2.6,  speed: 7.0, dist: [9, 10.5], victim: { who: 'jogger', item: 'sandwich', cost: 6000 }, moving: -2.6 },
  wedding:  { pres: 4.8,  speed: 6.9, dist: [8.5, 10], victim: { who: 'bride', item: 'photo', cost: 50000 } },
  wallet:   { pres: 3.5,  speed: 6.0, dist: [7, 8.5],  victim: { who: 'granny', item: 'wallet', cost: -3000 }, good: true },
  marathon: { pres: 5.5,  speed: 6.4, dist: [6, 7],    victim: { who: 'race', item: 'medal', cost: 0 }, good: true, center: true, moving: 5.6 },
}
// 道ばたの壊れ物（犬や引きずられた自分が勢いよく当たると壊れる）
export const FRAGILE = {
  pots:    { r: 0.42, cost: 4000, who: 'tanaka' },
  bikes:   { r: 0.55, cost: 12000, who: 'sato2' },
  laundry: { r: 0.6, cost: 7000, who: 'yamada' },
  skate:   { r: 0.35, cost: 9000, who: 'kid' },
}
const SOLID_R = { pole: 0.2, tree: 0.3, post: 0.12, mailbox: 0.25, vending: 0.5 }
const WRAPPABLE = { pole: 1, tree: 1, post: 1 }

export class Walk {
  constructor(seed = 1, o = {}) {
    this.seed = seed; this.rng = mulberry32(seed * 7919 + 13)
    this.t = 0; this.frame = 0; this.phase = 'play'
    this.props = []; this.events = []; this.ev = []
    this.dog = { x: 0, s: LEASH - 0.4, vx: 0, vs: 0, st: 'walk', st_t: 0, look: 0, ears: 0, sit: 0, ev: null, happy: 0, shirt: false, face: 0 }
    this.me = { x: 0, s: 0, vx: 0, vs: 0, st: 'walk', st_t: 0, grip: 1, lane: 0, holdT: 0, slipT: 0, skate: false, bowA: 0, dirt: 0 }
    this.wrap = null                    // { prop, lh, ld, t }
    this.pending = []                   // この騒ぎで壊した物（次のお辞儀でまとめて謝る）
    this.list = []                      // お詫び行脚リスト
    this.bow = null                     // { t, tapped, grade }
    this.medal = false; this.wallet = false; this.stranger = null
    this.stats = { holdT: 0, wraps: 0, bows: [], trips: 0, bolts: 0, stopped: 0 }
    this.result = null
    this.opts = o
    this.build(o)
    this.rope = []                      // 見た目の綱（Verlet、3D の x,y,s）
    for (let i = 0; i < 14; i++) { const k = i / 13; const p = { x: 0, y: 0.9 - k * 0.3, s: k * (LEASH - 0.4) }; p.px = p.x; p.py = p.y; p.ps = p.s; this.rope.push(p) }
  }
  r(a, b) { return a + (b - a) * this.rng() }
  pick(a) { return a[Math.floor(this.rng() * a.length)] }
  add(kind, x, s, extra = {}) {
    const f = FRAGILE[kind]
    const p = { id: this.props.length, kind, x, s, r: f ? f.r : (SOLID_R[kind] || 0.3), fragile: !!f, wrap: !!WRAPPABLE[kind], broken: false, hitT: 0, ...extra }
    this.props.push(p); return p
  }
  build(o) {
    // 出来事の並び。毎回くじで順番・左右・距離が変わる
    let pool = ['cat', 'pigeon', 'smalldog', 'yakiimo', 'jogger', 'wedding', 'cat', 'pigeon', 'smalldog', 'jogger']
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
    if (o.first) pool = ['cat', 'yakiimo'].concat(pool.filter((k, i) => !(k === 'cat' && i === pool.indexOf('cat')) && !(k === 'yakiimo')))   // 初回は短いのと長いのを最初に
    const rareW = o.wallet ?? this.rng() < 0.16, rareM = o.marathon ?? this.rng() < 0.13
    if (rareW) pool.splice(2 + Math.floor(this.rng() * 4), 0, 'wallet')
    if (rareM) pool.splice(3 + Math.floor(this.rng() * 3), 0, 'marathon')
    if (o.only) pool = [].concat(o.only)
    let s = 21, i = 0
    while (s < ROUTE - 26 && i < pool.length) {
      const kind = pool[i++], K = KINDS[kind]
      const side = K.center ? 0 : (this.rng() < 0.5 ? -1 : 1)
      const d = this.r(K.dist[0], K.dist[1])
      const ev = { id: this.events.length, kind, side, at: s, tx: side ? side * 3.05 : this.r(-0.6, 0.6), ts: s + d, x0: 0, s0: 0, pres: K.pres, speed: K.speed, st: 'wait', t: 0, reached: false, prevented: false }
      if (kind === 'smalldog') ev.tx = side * 2.2
      if (kind === 'jogger') ev.tx = side * 1.9
      if (kind === 'marathon') { ev.tx = 0; ev.ts = s + 6 }
      ev.x0 = ev.tx; ev.s0 = ev.ts
      this.events.push(ev)
      // 相手の所に置く壊れ物（犬が着いたら壊れる）
      if (kind === 'cat') ev.vp = this.add('pots', side * 2.75, ev.ts - 0.3, { owned: ev.id })
      if (kind === 'pigeon') ev.vp = this.add('bikes', (this.rng() < 0.5 ? -1 : 1) * 2.8, ev.ts + 0.6, { owned: ev.id })
      // この出来事に間に合う柱を1本（つかまる側は毎回くじ。相手と同じ側のこともある）
      const ps = s + this.r(-0.8, 2.2), pside = this.rng() < 0.5 ? -1 : 1
      this.add(this.rng() < 0.75 ? 'pole' : 'tree', pside * POLE_X, ps)
      s += this.r(21, 27)
    }
    this.lastEventS = s
    // 背景の電柱（片側ずつ交互・間隔ばらつき）
    for (let q = 9, side = 1; q < ROUTE - 4; q += this.r(11, 16), side = -side) {
      if (this.props.some(p => p.wrap && Math.abs(p.s - q) < 4)) continue
      this.add('pole', side * POLE_X, q)
    }
    // ガードレール（柱ごとに巻ける）
    for (let k = 0; k < 2; k++) {
      const s0 = this.r(40 + k * 90, 70 + k * 90), side = this.rng() < 0.5 ? -1 : 1
      if (this.props.some(p => Math.abs(p.s - s0) < 6 && Math.sign(p.x) === side)) continue
      for (let j = 0; j < 4; j++) this.add('post', side * 2.95, s0 + j * 1.5, { rail: k })
    }
    // 道ばたの壊れ物と物（相手のいない所に）
    const free = (x, s, rr = 1.6) => !this.props.some(p => hyp(p.x - x, p.s - s) < rr) && !this.events.some(e => Math.abs(e.ts - s) < 2 && Math.sign(e.tx) === Math.sign(x))
    const deco = ['pots', 'bikes', 'laundry', 'pots', 'mailbox', 'vending', 'bikes', 'laundry', 'pots', 'mailbox']
    for (let q = 14; q < ROUTE - 10; q += this.r(7, 12)) {
      const kind = this.pick(deco), side = this.rng() < 0.5 ? -1 : 1, x = side * (kind === 'vending' ? 3.1 : kind === 'laundry' ? 2.6 : 2.8)
      if (free(x, q)) this.add(kind, x, q)
    }
    // スケボー（道の真ん中寄りに1〜2枚。引きずられて乗ると止まらない）
    if (o.skateAt) this.add('skate', 0, o.skateAt)
    const nsk = o.skate ?? (this.rng() < 0.6 ? 2 : 1)
    for (let k = 0; k < nsk; k++) {
      const q = this.r(30 + k * 100, 110 + k * 100), x = this.r(-1.2, 1.2)
      if (free(x, q, 2)) this.add('skate', x, q)
    }
  }

  // ---------------------------------------------------------------- 入力 { hold, lane, tap(柱id), bowTap }
  // 巻ける柱: 自分より前（画面に見える所）で、リードの線（手から首輪）から近い物
  canWrap(p) {
    if (!p || !p.wrap || this.phase !== 'play') return false
    const m = this.me, d = this.dog
    const ahead = p.s - m.s
    if (ahead < 2.8 || ahead > LEASH + 3.5) return false
    const k = clamp(ahead / Math.max(0.5, d.s - m.s), 0, 1), lx = m.x + (d.x - m.x) * k
    const lim = (m.st === 'dragged' || m.st === 'getup' || m.skate) ? 2.4 : REACH
    return Math.abs(p.x - lx) < lim
  }
  reachable() { return this.props.filter(p => this.canWrap(p)) }
  doWrap(p) {
    if (this.wrap) { if (this.wrap.prop === p) this.unwrap(); return false }
    if (!this.canWrap(p)) return false
    const lh = Math.max(0.7, hyp(p.x - this.me.x, p.s - this.me.s))
    const ld = Math.max(1.1, LEASH - lh)
    // 今の犬の位置から、柱に巻き取るように短くしていく（一瞬で引き戻さない）
    const cur = hyp(p.x - this.dog.x, p.s - this.dog.s)
    this.wrap = { prop: p, lh, ld: Math.max(ld, cur), goal: ld, t: 0 }
    this.stats.wraps++
    this.ev.push({ k: 'wrap', p: p.id })
    const ev = this.dog.ev
    if (ev && (ev.st === 'alert' || ev.st === 'bolt') && !KINDS[ev.kind].good) ev.prevented = true
    return true
  }
  unwrap() { if (!this.wrap) return; this.ev.push({ k: 'unwrap', p: this.wrap.prop.id }); this.wrap = null }

  step(inp = {}) {
    this.frame++
    if (this.phase === 'end') return
    if (this.phase === 'bow') return this.stepBow(inp)
    if (this.phase === 'praise') { this.praiseT -= STEP; if (this.praiseT <= 0) this.phase = 'play'; return }
    const dt = STEP, d = this.dog, m = this.me
    this.t += dt
    if (inp.tap != null) { const p = this.props[inp.tap]; if (p) this.doWrap(p) }
    if (inp.lane != null) m.lane = clamp(inp.lane, -LANE, LANE)
    const holding = !!inp.hold && (m.st === 'walk' || m.st === 'hold')
    if (holding) this.stats.holdT += dt

    // ---- 出来事の始まり（犬が来たら耳が立つ）
    if (!d.ev && d.st === 'walk') {
      const ev = this.events.find(e => e.st === 'wait' && d.s >= e.at)
      if (ev) { ev.st = 'alert'; ev.t = 0; d.ev = ev; d.st = 'alert'; d.st_t = 0; this.ev.push({ k: 'alert', id: ev.id, kind: ev.kind }) }
    }
    const ev = d.ev
    if (ev) {
      ev.t += dt
      const K = KINDS[ev.kind]
      if (ev.st === 'alert' && ev.t >= ALERT) { ev.st = 'bolt'; ev.t = 0; d.st = 'bolt'; d.st_t = 0; this.stats.bolts++; this.ev.push({ k: 'bolt', id: ev.id, kind: ev.kind }) }
      if (ev.st === 'bolt' || ev.st === 'alert') {
        if (K.moving) {   // 動く相手（向かってくる人・前へ走るランナー）
          if (ev.st === 'bolt' || ev.kind !== 'marathon') ev.ts += K.moving * dt * (ev.st === 'alert' ? 0.35 : 1)
        }
      }
      if (ev.st === 'bolt') {
        const dd = hyp(ev.tx - d.x, ev.ts - d.s)
        if (ev.kind === 'marathon') {
          if (d.s > ev.at + 20 && !ev.reached) { ev.reached = true; this.medal = true; this.ev.push({ k: 'medal' }) }
        } else if (dd < 1.0 && !ev.reached) {
          ev.reached = true
          const v = K.victim
          if (K.good) { this.wallet = true; this.list.push({ who: v.who, item: v.item, cost: v.cost, good: true }); this.ev.push({ k: 'wallet', id: ev.id }) }
          else {
            this.pending.push({ who: v.who, item: v.item, cost: v.cost, ev: ev.id })
            if (ev.vp) ev.vp.broken = true
            if (ev.kind === 'jogger') this.stranger = { id: ev.id, t: 0 }
            this.ev.push({ k: 'reach', id: ev.id, kind: ev.kind })
          }
          d.st = 'proud'; d.st_t = 0
        }
        if (ev.t >= ev.pres || (ev.reached && d.st_t > 0.9)) {
          ev.st = 'done'; d.ev = null; d.st = 'walk'; d.st_t = 0
          if (!ev.reached && !K.good) { this.stats.stopped++; this.ev.push({ k: 'calm', id: ev.id }) }
          if (ev.kind === 'marathon' && !ev.reached && this.wrap == null) { /* 間に合わず */ }
          if (K.good && ev.reached && ev.kind === 'wallet') { this.phase = 'praise'; this.praiseT = 2.2 }
        }
      }
      if (ev.st === 'done' && d.ev === ev) d.ev = null
    }
    d.st_t += dt; m.st_t += dt

    // ---- 犬の行きたい速さ
    let dvx = 0, dvs = 0, acc = 5
    const tgt = d.ev
    if (d.st === 'alert') { acc = 9; d.ears = Math.min(1, d.ears + dt * 6); d.look = Math.atan2(tgt.tx - d.x, tgt.ts - d.s) }
    else if (d.st === 'bolt') {
      const dx = tgt.tx - d.x, ds = tgt.ts - d.s, L = hyp(dx, ds) || 1
      dvx = dx / L * tgt.speed; dvs = ds / L * tgt.speed; acc = 17; d.ears = 1; d.look = Math.atan2(dx, ds)
    } else if (d.st === 'proud') { acc = 10; d.ears = Math.max(0, d.ears - dt * 2); d.happy = 1 }
    else {   // ふつうに歩く。踏ん張られたら座る
      d.ears = Math.max(0, d.ears - dt * 2.5)
      if (holding && m.st === 'hold' && m.holdT > 0.45) d.sit = Math.min(1, d.sit + dt * 4)
      else d.sit = Math.max(0, d.sit - dt * 3)
      const wander = Math.sin(this.t * 0.7 + this.seed) * 0.5
      dvx = clamp((m.x + wander - d.x) * 1.2, -1.4, 1.4)
      dvs = (d.s < ROUTE + 2 ? 2.15 : 0) * (1 - d.sit)
      if (d.sit > 0.5) { dvx = 0; dvs = 0 }
      d.look = Math.atan2(d.vx, Math.max(0.3, d.vs)) * 0.6
      d.happy = Math.max(0, d.happy - dt * 0.3)
    }
    d.vx += clamp(dvx - d.vx, -acc * dt, acc * dt)
    d.vs += clamp(dvs - d.vs, -acc * dt, acc * dt)

    // ---- 自分
    const boltish = d.st === 'bolt'
    if (m.st === 'walk' || m.st === 'hold') m.st = holding ? 'hold' : 'walk'
    if (m.st === 'hold') m.holdT += dt; else m.holdT = 0
    let pacc = 7
    let pvx = 0, pvs = 0
    if (m.st === 'walk') {
      const gap = d.s - m.s
      pvs = clamp((gap - LEASH * 0.86) * 2.4, -1.0, 2.9)
      pvx = clamp((m.lane - m.x) * 3, -2.8, 2.8)
    } else if (m.st === 'hold') {
      pvs = 0; pvx = clamp((m.lane - m.x) * 1.6, -1.3, 1.3); pacc = T.holdAcc
    } else if (m.st === 'dragged') {
      pvx = clamp((m.lane - m.x) * 0.6, -0.6, 0.6); pacc = 0.6
    } else if (m.st === 'getup' || m.st === 'bowpre') { pacc = 12 }
    m.vx += clamp(pvx - m.vx, -pacc * dt, pacc * dt)
    if (m.st !== 'dragged') m.vs += clamp(pvs - m.vs, -pacc * dt, pacc * dt)

    // ---- 動かす → 拘束 → 速さを戻す（Verlet と同じ形の位置ベース）
    const ox = d.x, os = d.s, mx = m.x, ms = m.s
    d.x += d.vx * dt; d.s += d.vs * dt
    m.x += m.vx * dt; m.s += m.vs * dt
    const imD = 0.5
    const imP = m.st === 'hold' ? (m.grip > 0 ? T.holdIm : 1) : m.st === 'dragged' ? (m.skate ? 0.75 : 1.15) : 1
    let taut = false, corrD = 0
    for (let it = 0; it < 4; it++) {
      if (this.wrap) {
        const p = this.wrap.prop
        let dx = m.x - p.x, ds = m.s - p.s, L = hyp(dx, ds)
        if (L > this.wrap.lh) { const k = (L - this.wrap.lh) / L; m.x -= dx * k; m.s -= ds * k }
        dx = d.x - p.x; ds = d.s - p.s; L = hyp(dx, ds)
        if (L > this.wrap.ld) { const k = (L - this.wrap.ld) / L; d.x -= dx * k; d.s -= ds * k; corrD += L - this.wrap.ld; taut = true }
      } else {
        const dx = d.x - m.x, ds = d.s - m.s, L = hyp(dx, ds)
        if (L > LEASH) {
          const diff = L - LEASH, wD = imD / (imD + imP), nx = dx / L, ns = ds / L
          d.x -= nx * diff * wD; d.s -= ns * diff * wD
          m.x += nx * diff * (1 - wD); m.s += ns * diff * (1 - wD)
          corrD += diff * wD; taut = true
        }
      }
      this.collide(d, 0.42, true)
      this.collide(m, m.st === 'dragged' ? 0.4 : 0.3, false)
    }
    d.vx = (d.x - ox) / dt; d.vs = (d.s - os) / dt
    if (hyp(d.vx, d.vs) > 0.4) { let a = Math.atan2(d.vx, d.vs), da = a - (d.hd || 0); while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; d.hd = (d.hd || 0) + da * 0.25 }
    if (d.st === 'alert' && d.ev) { let a = Math.atan2(d.ev.tx - d.x, d.ev.ts - d.s), da = a - (d.hd || 0); while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; d.hd = (d.hd || 0) + da * 0.08 }
    m.vx = (m.x - mx) / dt; m.vs = (m.s - ms) / dt
    if (m.st === 'hold' && m.grip > 0) { m.vx *= T.holdFric; m.vs *= T.holdFric }
    if (m.st === 'dragged') { const f = m.skate ? 0.997 : 0.982; m.vx *= f; m.vs *= f }
    if (m.st === 'getup') { m.vx *= 0.8; m.vs *= 0.8 }
    this.taut = taut; this.strain = corrD / dt

    // ---- 踏ん張りの残り・転ぶ
    const pulled = taut && (d.st === 'bolt') && !this.wrap
    if (m.st === 'hold') {
      if (pulled) m.grip -= dt / GRIP
      if (m.grip <= 0) { m.grip = 0; this.fall('grip') }
    } else if (m.st === 'walk') {
      if (pulled && hyp(d.vx, d.vs) > T.tripV) m.slipT += dt; else m.slipT = Math.max(0, m.slipT - dt * 2)
      if (m.slipT > T.tripT) this.fall('yank')
    }
    if (!pulled && m.st !== 'dragged') m.grip = Math.min(1, m.grip + dt / 2.6)
    if (m.st === 'dragged') {
      m.dirt = Math.min(1, m.dirt + Math.hypot(m.vx, m.vs) * dt * 0.05)
      // スケボー
      if (!m.skate) for (const p of this.props) if (p.kind === 'skate' && !p.broken && !p.ridden && hyp(p.x - m.x, p.s - m.s) < 0.95) { p.ridden = true; m.skate = p; this.ev.push({ k: 'skate', p: p.id }) }
      const calm = d.st !== 'bolt'
      if (calm && hyp(m.vx, m.vs) < (m.skate ? 1.4 : 0.7)) {
        if (m.skate) { this.crashSkate('stop') }
        m.st = 'getup'; m.st_t = 0
      }
    }
    if (m.st === 'getup' && m.st_t > 0.75) { m.st = 'walk'; m.st_t = 0; m.grip = Math.max(m.grip, 0.5) }

    // ---- 巻きつけを外す（落ち着いて少ししたら自動）
    if (this.wrap && this.wrap.ld > this.wrap.goal) this.wrap.ld = Math.max(this.wrap.goal, this.wrap.ld - T.reel * dt)
    if (this.wrap) {
      const busy = d.st === 'alert' || d.st === 'bolt'
      this.wrap.t = busy ? 0 : this.wrap.t + dt
      if (this.wrap.t > 1.3) this.unwrap()
    }
    if (this.stranger) this.stranger.t += dt

    // ---- お辞儀へ（騒ぎが落ち着いて、壊した物があれば）
    if (this.pending.length && d.st === 'walk' && (m.st === 'walk' || m.st === 'hold')) this.startBow()

    // ---- 見た目の綱
    this.stepRope()

    // ---- 終わり
    if (d.s >= ROUTE && m.s >= ROUTE - LEASH - 1 && this.phase === 'play' && !d.ev) this.finish(true)
    else if (this.t >= LIMIT && this.phase === 'play') this.finish(false)
  }

  fall(why) {
    const m = this.me
    m.st = 'dragged'; m.st_t = 0; m.slipT = 0; this.stats.trips++
    this.ev.push({ k: 'trip', why })
  }
  crashSkate(why) {
    const m = this.me, p = m.skate; if (!p) return
    m.skate = false; p.broken = true
    this.pending.push({ who: FRAGILE.skate.who, item: 'skate', cost: FRAGILE.skate.cost })
    this.ev.push({ k: 'break', p: p.id, kind: 'skate', why })
  }
  collide(e, r, isDog) {
    e.x = clamp(e.x, -3.3, 3.3)
    if (e.s < -2) e.s = -2
    const sp = hyp(e.vx, e.vs)
    for (const p of this.props) {
      if (p.broken || p.kind === 'skate') continue
      if (Math.abs(p.s - e.s) > 2) continue
      const dx = e.x - p.x, ds = e.s - p.s, L = hyp(dx, ds), R = r + p.r
      if (L >= R || L < 1e-6) continue
      if (p.fragile && ((isDog && sp > 2.5) || (!isDog && this.me.st === 'dragged' && sp > 1.0))) {
        p.broken = true; p.hitBy = isDog ? 'dog' : 'me'
        const f = FRAGILE[p.kind]
        if (p.owned != null) { const ev = this.events[p.owned]; this.pending.push({ who: KINDS[ev.kind].victim.who, item: p.kind, cost: f.cost, ev: ev.id }) }
        else this.pending.push({ who: f.who, item: p.kind, cost: f.cost })
        if (p.kind === 'laundry' && isDog) this.dog.shirt = true
        this.ev.push({ k: 'break', p: p.id, kind: p.kind })
        if (!isDog && this.me.skate) this.crashSkate('hit')
        continue
      }
      const k = (R - L) / L; e.x += dx * k; e.s += ds * k
      if (!isDog && this.me.st === 'dragged' && sp > 2.2 && !p.fragile && (p.hitT || 0) < this.t - 1) { p.hitT = this.t; this.ev.push({ k: 'bonk', p: p.id }) ; if (this.me.skate) this.crashSkate('pole') }
    }
  }

  // ---------------------------------------------------------------- お辞儀（深い所で押すほど許してもらえる）
  // 角度 = 90 * sin^2(pi t / BOW_T)。1往復 BOW_T 秒、2往復で押さなければ「無言」
  startBow() {
    this.phase = 'bow'; this.bow = { t: 0, tapped: false, grade: null, items: this.pending.splice(0) }
    this.ev.push({ k: 'bowStart', n: this.bow.items.length })
  }
  static bowAngle(t) { const s = Math.sin(Math.PI * t / BOW_T); return 90 * s * s }
  stepBow(inp) {
    const b = this.bow
    if (!b.grade) {
      b.t += STEP
      this.me.bowA = Walk.bowAngle(b.t)
      if (inp.bowTap && b.t > 0.08) {
        const a = this.me.bowA
        b.grade = a >= 76 ? 'deep' : a >= 52 ? 'good' : 'nod'
        b.endT = 0
      } else if (b.t >= BOW_T * 2) { b.grade = 'silent'; b.endT = 0 }
      if (b.grade) {
        const mul = { deep: 0.5, good: 0.75, nod: 1, silent: 1.2 }[b.grade]
        for (const it of b.items) this.list.push({ ...it, cost: Math.round(it.cost * mul / 100) * 100, base: it.cost, grade: b.grade })
        this.stats.bows.push(b.grade)
        this.ev.push({ k: 'bowGrade', grade: b.grade })
      }
      return
    }
    b.endT += STEP
    const a = b.grade === 'deep' ? 90 : b.grade === 'good' ? 65 : b.grade === 'nod' ? 25 : 8
    this.me.bowA += (a - this.me.bowA) * 0.2
    if (b.endT > 1.15) { this.phase = 'play'; this.bow = null; this.me.bowA = 0; this.stranger = null; this.dog.shirt = this.dog.shirt && this.rng() < 0.5 }
  }

  // ---------------------------------------------------------------- 綱（Verlet。両端は手と首輪、巻きつけ中は柱の点を通る）
  handPos() { const m = this.me; if (m.st === 'dragged') return { x: m.x, y: 0.35, s: m.s + 0.55 }; if (m.st === 'hold') return { x: m.x, y: 0.75, s: m.s + 0.25 }; return { x: m.x + 0.12, y: 0.85, s: m.s + 0.3 } }
  collarPos() { const d = this.dog, a = d.hd || 0; const h = d.sit > 0.5 ? 1.12 : 1.04, f = d.sit > 0.5 ? 0.62 : 0.74; return { x: d.x + Math.sin(a) * f, y: h, s: d.s + Math.cos(a) * f } }
  stepRope() {
    const R = this.rope, n = R.length, a = this.handPos(), b = this.collarPos()
    const g = -9.8 * STEP * STEP
    for (const p of R) {
      const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96, vs = (p.s - p.ps) * 0.96
      p.px = p.x; p.py = p.y; p.ps = p.s
      p.x += vx; p.y += vy + g; p.s += vs
    }
    let pinI = -1, pin = null
    if (this.wrap) {
      const p = this.wrap.prop
      pinI = Math.round((n - 1) * clamp(this.wrap.lh / LEASH, 0.15, 0.85))
      pin = { x: p.x - Math.sign(p.x) * p.r, y: 0.95, s: p.s }
    }
    const seg = LEASH / (n - 1)
    for (let it = 0; it < 10; it++) {
      R[0].x = a.x; R[0].y = a.y; R[0].s = a.s
      R[n - 1].x = b.x; R[n - 1].y = b.y; R[n - 1].s = b.s
      if (pin) { const q = R[pinI]; q.x = pin.x; q.y = pin.y; q.s = pin.s }
      for (let i = 0; i < n - 1; i++) {
        const p = R[i], q = R[i + 1]
        const dx = q.x - p.x, dy = q.y - p.y, ds = q.s - p.s, L = Math.hypot(dx, dy, ds) || 1e-6
        if (L <= seg) continue
        const k = (L - seg) / L * 0.5
        const fp = i === 0 || i === pinI ? 0 : 1, fq = i + 1 === n - 1 || i + 1 === pinI ? 0 : 1, tot = fp + fq || 1
        p.x += dx * k * 2 * fp / tot; p.y += dy * k * 2 * fp / tot; p.s += ds * k * 2 * fp / tot
        q.x -= dx * k * 2 * fq / tot; q.y -= dy * k * 2 * fq / tot; q.s -= ds * k * 2 * fq / tot
      }
      for (const p of R) if (p.y < 0.02) p.y = 0.02
    }
    this.ropePin = pinI
  }

  finish(home) {
    this.phase = 'end'
    const m = this.me
    if (!home) {
      const left = Math.max(0, ROUTE - this.dog.s)
      this.list.push({ who: 'family', item: 'pickup', cost: 30000 + Math.round(left * 200 / 100) * 100, late: true })
    }
    const total = this.list.reduce((a, b) => a + b.cost, 0)
    const bad = this.list.filter(x => !x.good).length
    let rank
    if (home && bad === 0) rank = 0
    else if (total <= 12000) rank = 1
    else if (total <= 40000) rank = 2
    else if (total <= 90000) rank = 3
    else rank = 4
    this.result = { home, total, bad, rank, time: this.t, medal: this.medal, wallet: this.wallet, list: this.list.slice(), stats: this.stats }
    this.ev.push({ k: 'end', home })
  }
}
export const BOW_T = 1.15
