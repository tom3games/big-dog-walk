// 大型犬の散歩 v2: 遊びの計算（DOM と three.js に触らない。Node の sim.mjs でも同じ計算で bot を回す）
// 3列のランナー。犬が前を走って自分を引っぱる。自分は列を替える・跳ぶ・しゃがむでよける
// 座標: x = 横（右が+、m）、s = 家までの道のり（前が+、m）、y = 高さ。固定 60Hz で step(input)
// リードの決まり: 細くて背の高い物を犬と反対側で通ると、リードがその物に巻きつく（人なら巻き込む）
export const STEP = 1 / 60
export const ROUTE = 1050          // 家までの道のり（m）
export const LIMIT = 180           // 夕飯まで（秒）
export const LX = 1.5              // 列の間隔（列は -1, 0, 1）
export const GAP = 3.4             // 犬は自分のこれだけ前を走る
export const V0 = 6.0, VMAX = 10.6 // 走る速さ（だんだん速くなる）
export const JUMP_V = 5.6, GRAV = 17   // 跳んでいる時間 0.66 秒・高さ 0.92m
export const DUCK_T = 0.62
export const ALERT = 1.05          // 耳が立ってから犬が横へ飛ぶまで
export const YANK_GRACE = 0.42     // 犬と違う列にいて引っぱられるまで
export const BOW_T = 0.9           // お辞儀の1往復
export const TUMBLE_T = 1.05       // 転んで引きずられる時間
export const LEASH = 4.2

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0

// 障害物。h: low=跳ぶ（しゃがみ不可）／high=しゃがむ（跳ぶと当たる）／tall=列を替える
// wrap: 細くて背が高い物。犬と反対側を通るとリードが巻きつく。cost は持ち主へのお詫び（円）
export const OB = {
  banana:    { h: 'low',  len: 0.5, who: 'yaoya',   cost: 3000 },
  manhole:   { h: 'low',  len: 0.9, who: 'koji',    cost: 5000 },
  cement:    { h: 'low',  len: 1.6, who: 'sakan',   cost: 20000 },
  puddle:    { h: 'low',  len: 1.3, who: 'white',   cost: 6000 },
  cat:       { h: 'low',  len: 0.6, who: 'catlady', cost: 3000 },
  skate:     { h: 'low',  len: 0.8, who: 'kid',     cost: 9000, vs: -2.6 },
  bar:       { h: 'high', len: 0.3, who: 'yamada',  cost: 7000 },
  crow:      { h: 'high', len: 0.9, who: 'gomi',    cost: 2000, sweep: true },
  sprinkler: { h: 'tall', len: 1.2, who: 'suzuki',  cost: 4000 },
  bike:      { h: 'tall', len: 1.7, who: 'student', cost: 12000, vs: -4.2 },
  pot:       { h: 'tall', len: 0.7, who: 'tanaka',  cost: 4000, fall: true },
  truck:     { h: 'tall', len: 6.0, who: 'seiso',   cost: 8000 },
  gate:      { h: 'tall', len: 1.3, who: 'yamada2', cost: 10000, gate: true },
  cart:      { h: 'tall', len: 1.0, who: 'deliv',   cost: 7000, cross: true },
  sign:      { h: 'tall', len: 0.5, who: 'koji',    cost: 3000, wrap: true },
  walker:    { h: 'tall', len: 0.6, who: 'walker',  cost: 5000, wrap: true, vs: -1.3 },
  pole:      { h: 'tall', len: 0.4, who: 'pole',    cost: 0,    wrap: true },
  wedding:   { h: 'tall', len: 3.0, who: 'bride',   cost: 50000, wrap: true },
  runner:    { h: 'tall', len: 0.6, who: 'race',    cost: 3000, wrap: true, vs: 4.2 },
}
// 犬が飛びつく相手（道ばた）
export const DARTS = ['cat', 'pigeon', 'yakiimo', 'smalldog']

export class Walk {
  constructor(seed = 1, o = {}) {
    this.seed = seed; this.rng = mulberry32(seed * 7919 + 13)
    this.t = 0; this.frame = 0; this.phase = 'play'
    this.obs = []; this.treats = []; this.darts = []; this.ev = []; this.extras = []
    this.me = { x: 0, s: 0, y: 0, vy: 0, lane: 0, duck: 0, st: 'run', st_t: 0, inv: 0, laneT: 9, prevLane: 0, jumpT: 9, duckT0: 9, yankT: 0, bowA: 0, slow: 1, dirt: 0, boost: 0 }
    this.dog = { x: 0, s: GAP, y: 0, vy: 0, vx: 0, lane: 0, ears: 0, hd: 0, happy: 0, dart: null, followT: 0, dodgeFor: null, sit: 0 }
    this.v = V0
    this.bow = null; this.wrapped = null; this.pending = null
    this.list = []; this.medal = false; this.wallet = false
    this.chain = 0; this.stats = { near: 0, bestChain: 0, treats: 0, hits: 0, wraps: 0, yanks: 0, bows: [], jumps: 0, ducks: 0, swaps: 0 }
    this.result = null; this.opts = o
    this.build(o)
    this.rope = []
    for (let i = 0; i < 14; i++) { const k = i / 13; const p = { x: 0, y: 0.9 - k * 0.2, s: 0.3 + k * (GAP - 0.6) }; p.px = p.x; p.py = p.y; p.ps = p.s; this.rope.push(p) }
  }
  r(a, b) { return a + (b - a) * this.rng() }
  ri(n) { return Math.floor(this.rng() * n) }
  pick(a) { return a[this.ri(a.length)] }
  vAt(s) { return V0 + (VMAX - V0) * clamp(s / ROUTE, 0, 1) }
  add(kind, lane, s, extra = {}) {
    const K = OB[kind]
    const o = { id: this.obs.length, kind, lane, x: lane * LX, s, len: K.len, h: K.h, wrap: !!K.wrap, vs: 0, vx: 0, st: 'wait', hit: false, done: false, sideD: null, dogPassed: false, mePassed: false, near: false, t: 0, ...extra }
    if (K.gate) { o.side = lane; o.x = lane * (LX + 1.6); o.open = 0 }
    if (K.cross) { o.dir = extra.dir || (this.rng() < 0.5 ? 1 : -1); o.x = -o.dir * 3.4 }
    if (K.sweep) { o.dir = extra.dir || (this.rng() < 0.5 ? 1 : -1); o.x = -o.dir * 4.2 }
    if (K.fall) o.fallY = 4.6
    this.obs.push(o); return o
  }
  treatLine(lane, s, n = 5, arc = null) {
    for (let i = 0; i < n; i++) {
      const ss = s + i * 1.5
      let y = 0.55
      if (arc) { const u = (ss - arc.s0) / (arc.s1 - arc.s0); if (u > 0 && u < 1) y = 0.55 + Math.sin(u * Math.PI) * 0.95 }
      this.treats.push({ id: this.treats.length, lane, x: lane * LX, s: ss, y, got: false })
    }
  }

  // ---------------------------------------------------------------- 道を作る（毎回くじ。だんだん詰まる）
  build(o) {
    const lanes = [-1, 0, 1]
    const other = (l, n = 1) => { const a = lanes.filter(q => q !== l); if (this.rng() < 0.5) a.reverse(); return a.slice(0, n) }
    const LOW = ['banana', 'manhole', 'puddle', 'cat', 'cement', 'skate']
    const TALL = ['sprinkler', 'bike', 'pot', 'sign', 'walker', 'cart', 'gate', 'pole']
    const sideLane = () => this.rng() < 0.5 ? -1 : 1
    const laneFor = k => OB[k].gate || k === 'pole' ? sideLane() : OB[k].cross || OB[k].sweep ? 0 : this.pick(lanes)
    let s = 26
    const end = ROUTE - 20
    // 初回は1つずつ覚える並び（よける、跳ぶ、しゃがむ、犬と同じ側、犬について行く）
    const intro = o.first ? ['tutSwipe', 'tutJump', 'tutDuck', 'tutSide', 'tutDart'] : []
    const rareW = o.wallet ?? this.rng() < 0.16, rareM = o.marathon ?? this.rng() < 0.13
    const walletAt = rareW ? this.r(260, 700) : -1, marathonAt = rareM ? this.r(420, 760) : -1
    let nextDart = o.first ? 9e9 : this.r(100, 160)
    const gapAt = s => { const d = clamp(s / ROUTE, 0, 1); return this.vAt(s) * this.r(1.45 - d * 0.4, 1.85 - d * 0.55) }
    const pat = o.only ? [].concat(o.only) : null
    let pi = 0
    while (s < end) {
      const d = clamp(s / ROUTE, 0, 1)
      if (intro.length) {
        const k = intro.shift()
        if (k === 'tutSwipe') { this.add('sprinkler', 0, s, { tut: 'swipe' }); this.treatLine(1, s - 6, 4); s += 22; continue }
        if (k === 'tutJump') { for (const l of lanes) this.add('puddle', l, s, l === 0 ? { tut: 'jump' } : {}); this.treatLine(0, s - 3, 5, { s0: s - 2, s1: s + 2.5 }); s += 22; continue }
        if (k === 'tutDuck') { for (const l of lanes) this.add('bar', l, s, { span: 3, ...(l === 0 ? { tut: 'duck' } : {}) }); s += 22; continue }
        if (k === 'tutSide') { this.add('walker', 0, s + 6, { tut: 'side', vs0: 0 }); s += 26; continue }
        if (k === 'tutDart') { this.addDart(s, 1, 'cat', { tut: 'dart' }); s += 56; nextDart = s + this.r(90, 140); continue }
      }
      if (pat) {   // 検証用: 指定の物だけを順に
        const k = pat[pi++ % pat.length]
        if (DARTS.includes(k)) { this.addDart(s, sideLane(), k); s += 56; continue }
        this.add(k, laneFor(k), s); s += Math.max(16, gapAt(s)); continue
      }
      // 珍しい出来事
      if (walletAt > 0 && s >= walletAt && !this.walletPlaced) { this.walletPlaced = true; const l = this.pick(lanes); this.extras.push({ kind: 'wallet', lane: l, x: l * LX, s: s + 2, got: false }); this.treatLine(l, s - 6, 3); s += gapAt(s); continue }
      if (marathonAt > 0 && s >= marathonAt && !this.marathonPlaced) {
        this.marathonPlaced = true
        // マラソンの列（同じ向きに走る人を追い越しながら縫う）。最後にゴールのアーチ
        this.extras.push({ kind: 'marathon', s0: s, s1: s + 90 })
        for (let k = 0; k < 8; k++) this.add('runner', this.pick(lanes), s + 16 + k * 8 + this.r(-1.2, 1.2), { runner: true })
        s += 100; continue
      }
      // 犬が横へ飛ぶ（合図つき）
      if (s >= nextDart && s < end - 70) {
        this.addDart(s, sideLane(), this.pick(DARTS))
        s += 48 + this.vAt(s) * 1.2; nextDart = s + this.r(90, 160) * (1 - d * 0.25); continue
      }
      // ふつうの並び
      const roll = this.rng()
      let used = 0
      if (roll < 0.17) {          // 1つ
        const k = this.pick(d < 0.15 ? ['banana', 'puddle', 'sign', 'walker', 'pole', 'cat'] : LOW.concat(TALL, ['bar', 'crow']))
        const ln = laneFor(k)
        this.add(k, ln, s)
        if (!OB[k].cross && !OB[k].sweep) this.treatLine(other(ln)[0], s - 4, 4)
      } else if (roll < 0.34) {   // 2列ふさぐ（1列だけ空く）
        const free = this.pick(lanes)
        for (const l of lanes) if (l !== free) this.add(this.pick(['sprinkler', 'sign', 'walker', 'bike', 'pot', 'puddle', 'banana', 'manhole']), l, s + this.r(-0.4, 0.4))
        this.treatLine(free, s - 3, 4)
      } else if (roll < 0.47) {   // 真ん中に人や看板（犬と同じ側を通る）
        this.add(this.pick(d > 0.4 && this.rng() < 0.35 ? ['wedding'] : ['walker', 'sign', 'walker']), 0, s, { vs0: 0 })
        if (this.rng() < 0.5) this.add('pole', sideLane(), s + 10)
      } else if (roll < 0.6) {    // 全部の列に低い物（跳ぶ）
        const k = this.pick(['puddle', 'cement', 'manhole', 'banana'])
        for (const l of lanes) this.add(k, l, s)
        this.treatLine(this.pick(lanes), s - 2.5, 5, { s0: s - 1.5, s1: s + 3 })
      } else if (roll < 0.71) {   // しゃがむ（物干し竿・カラス）
        if (this.rng() < 0.55) {
          const k = this.pick([[-1, 0], [0, 1], [-1, 0, 1]])
          for (const l of k) this.add('bar', l, s, { span: k.length })
          if (k.length < 3) this.add(this.pick(['sprinkler', 'bike', 'sign']), lanes.find(l => !k.includes(l)), s)
        } else this.add('crow', 0, s)
      } else if (roll < 0.8) {    // 動く物（自転車・台車・門・植木鉢・スケボー）
        const k = this.pick(['bike', 'cart', 'gate', 'pot', 'skate', 'bike'])
        const ln = laneFor(k)
        this.add(k, ln, s + (OB[k].vs ? 8 : 0))
        if (d > 0.35 && !OB[k].cross) this.add(this.pick(['banana', 'puddle']), other(ln)[0], s + 4)
      } else if (roll < 0.9) {    // ゴミ収集車（長い）＋ほかの列に低い物
        const ln = this.pick(lanes)
        this.add('truck', ln, s)
        const o2 = other(ln, 2)
        this.add(this.pick(['banana', 'puddle', 'manhole']), o2[0], s + 2.5)
        if (d > 0.5) this.add(this.pick(['sign', 'sprinkler']), o2[1], s + 4.5)
        used = 6
      } else {                    // 組み合わせ（跳んでから替える）
        const l1 = this.pick(lanes)
        this.add(this.pick(['puddle', 'banana', 'manhole', 'cat']), l1, s)
        this.add(this.pick(['sprinkler', 'sign', 'bike', 'pot']), l1, s + 6)
        this.treatLine(other(l1)[0], s + 3, 4)
      }
      s += Math.max(15, gapAt(s)) + used
    }
    // 道ばたの電柱（飾り。遊びには関わらない）
    this.deco = []
    for (let q = 8, side = 1; q < ROUTE + 20; q += this.r(14, 22), side = -side) this.deco.push({ kind: 'pole', side, s: q })
  }
  addDart(s, side, target, extra = {}) {
    // 合図は犬が s に来た時。犬は外側の列（side）へ寄って dur 秒そのまま。相手は道ばた
    const v = this.vAt(s), dur = 2.3 + this.rng() * 0.6
    const dz = { id: this.darts.length, s, side, target, st: 'wait', t: 0, dur, tx: side * 3.3, ts: s + 2 + v * (ALERT + dur * 0.55), reached: false, ...extra }
    this.darts.push(dz)
    // 寄った列には跳ぶ物を1つ（ついて行ったら跳ぶ）、真ん中には人か看板（遅れて別の列にいると巻きつく）
    const ds = s - GAP + v * (ALERT + 0.9)   // 自分が引っぱられてその列に入るあたり
    this.add(this.pick(['puddle', 'banana', 'manhole', 'cat']), side, ds + v * 0.6 + 2)
    this.add(this.pick(['sign', 'walker']), 0, ds + v * 0.15, { vs0: 0 })
    this.treatLine(side, ds - 1, 3)
    return dz
  }

  // ---------------------------------------------------------------- 入力 { move: -1|0|1, jump, duck, bowTap }
  step(inp = {}) {
    this.frame++
    if (this.phase === 'end') return
    const dt = STEP, m = this.me, d = this.dog
    this.t += dt
    m.st_t += dt; m.inv = Math.max(0, m.inv - dt); m.laneT += dt; m.jumpT += dt; m.duckT0 += dt
    if (m.boost > 0) m.boost = Math.max(0, m.boost - dt)

    // ---- お辞儀（その間も時計は進む）
    if (m.st === 'bow') { this.stepBow(inp); this.stepDog(dt); this.stepRope(); if (this.t >= LIMIT) this.finish(false); return }

    // ---- 速さ（犬に引っぱられて進む）
    const base = this.vAt(m.s)
    if (m.st === 'run') m.slow = Math.min(1, m.slow + dt / 1.8)
    let v = base * m.slow + (m.boost > 0 ? 0.9 : 0)
    if (m.st === 'tumble') v = base * 0.5 * Math.max(0.15, 1 - m.st_t / TUMBLE_T)
    if (m.st === 'getup') v = base * 0.25
    this.v = v

    // ---- 自分の操作
    if (m.st === 'run') {
      if (inp.move) { const nl = clamp(m.lane + inp.move, -1, 1); if (nl !== m.lane) { m.prevLane = m.lane; m.lane = nl; m.laneT = 0; this.stats.swaps++; this.ev.push({ k: 'swap', dir: inp.move }) } }
      if (inp.jump && m.y <= 0.001 && m.vy <= 0) { m.vy = JUMP_V; m.duck = 0; m.jumpT = 0; this.stats.jumps++; this.ev.push({ k: 'jump' }) }
      if (inp.duck) {
        if (m.y > 0.05) m.vy = Math.min(m.vy, -9)   // 空中で下: すぐ降りる
        m.duck = DUCK_T; m.duckT0 = 0; this.stats.ducks++; this.ev.push({ k: 'duck' })
      }
    }
    // 横の動き（列へ寄る。転んでいる間は犬の列へ引きずられる）
    const tx = m.st === 'tumble' ? d.x : m.lane * LX
    const lat = m.st === 'tumble' ? 3 : 11
    m.x += clamp(tx - m.x, -lat * dt, lat * dt)
    if (m.y > 0 || m.vy > 0) { m.vy -= GRAV * dt; m.y += m.vy * dt; if (m.y <= 0) { m.y = 0; m.vy = 0; this.ev.push({ k: 'land' }) } }
    if (m.duck > 0) m.duck = Math.max(0, m.duck - dt)
    m.s += v * dt

    this.stepDog(dt)
    this.stepDarts(dt)
    for (const o of this.obs) this.stepOb(o, dt)

    // おやつ・財布
    if (m.st === 'run') {
      for (const tr of this.treats) {
        if (tr.got || tr.s < m.s - 1 || tr.s > m.s + 1) continue
        if (Math.abs(tr.x - m.x) < 0.75 && Math.abs(tr.s - m.s) < 0.7 && Math.abs(tr.y - (m.y + 0.6)) < 0.75) { tr.got = true; this.stats.treats++; this.ev.push({ k: 'treat', id: tr.id }) }
      }
      for (const ex of this.extras) {
        if (ex.kind === 'wallet' && !ex.got && Math.abs(ex.s - m.s) < 0.8 && Math.abs(ex.x - m.x) < 0.8) { ex.got = true; this.wallet = true; this.list.push({ who: 'granny', item: 'wallet', cost: -3000, good: true }); this.ev.push({ k: 'wallet' }) }
      }
    }
    for (const ex of this.extras) if (ex.kind === 'marathon' && !ex.done && m.s >= ex.s1) { ex.done = true; this.medal = true; this.list.push({ who: 'race', item: 'medal', cost: 0, good: true }); this.ev.push({ k: 'medal' }) }

    // ---- 転ぶ、お辞儀、起きる
    if (m.st === 'tumble') { m.dirt = Math.min(1, m.dirt + dt * 0.4); if (m.st_t >= TUMBLE_T) this.startBow() }
    if (m.st === 'getup' && m.st_t > 0.35) { m.st = 'run'; m.st_t = 0; m.inv = 0.9; m.slow = 0.6 }

    this.stepRope()

    if (m.s >= ROUTE && this.phase === 'play') this.finish(true)
    else if (this.t >= LIMIT && this.phase === 'play') this.finish(false)
  }

  // ---------------------------------------------------------------- 犬（前を走る。背の高い物は先によける。たまに横へ飛ぶ）
  blockedFor(l, s) { return this.obs.some(o => !o.done && o.h === 'tall' && this.occupies(o, l, s, 0.1, 7.5)) }
  stepDog(dt) {
    const d = this.dog, m = this.me
    const gap = m.st === 'tumble' ? GAP + 0.6 : m.st === 'bow' ? GAP - 0.4 : GAP
    d.s += (m.s + gap - d.s) * Math.min(1, dt * 8)
    if (m.st === 'bow') { d.sit = Math.min(1, d.sit + dt * 5); d.ears = Math.max(0, d.ears - dt * 3); d.vx = 0; this.dogLook(dt); return }
    d.sit = Math.max(0, d.sit - dt * 4)
    const dz = d.dart
    let want = d.lane
    if (dz && dz.st === 'go') want = dz.side
    else {
      const blocked = l => this.blockedFor(l, d.s)
      if (blocked(d.lane)) {
        // 先によける。飼い主が空いている側にいればそちら、だめならくじ（一度決めたら変えない）
        const opts = [d.lane - 1, d.lane + 1].filter(l => l >= -1 && l <= 1 && !blocked(l))
        if (opts.length) {
          if (d.dodgeFor == null || !opts.includes(d.dodgeFor)) d.dodgeFor = opts.includes(m.lane) ? m.lane : opts.length > 1 ? (this.rng() < 0.5 ? opts[0] : opts[1]) : opts[0]
          want = d.dodgeFor
        }
      } else {
        d.dodgeFor = null
        // 飼い主の列へ少し遅れてついて行く（行き先が空いていれば）
        if (m.lane !== d.lane) { d.followT += dt; const nx = d.lane + sgn(m.lane - d.lane); if (d.followT > 0.38 && !blocked(nx)) want = nx }
        else d.followT = 0
      }
    }
    if (want !== d.lane) { d.lane = want; d.followT = 0; this.ev.push({ k: 'dogSwap', lane: want }) }
    const before = d.x
    d.x += clamp(d.lane * LX - d.x, -7.5 * dt, 7.5 * dt)
    // 低い物は自分で跳び越える
    if (d.y <= 0 && this.obs.some(o => !o.done && o.h === 'low' && Math.abs(o.x - d.x) < 0.7 && o.s - d.s > 0 && o.s - d.s < 1.3)) d.vy = 4.8
    if (d.y > 0 || d.vy > 0) { d.vy -= 15 * dt; d.y = Math.max(0, d.y + d.vy * dt); if (d.y === 0) d.vy = 0 }
    d.vx = (d.x - before) / dt
    d.happy = Math.max(0, d.happy - dt * 0.4)
    this.dogLook(dt)
  }
  dogLook(dt) { const d = this.dog, a = Math.atan2(d.vx || 0, Math.max(2, this.v)) * 1.2; d.hd += (a - d.hd) * Math.min(1, dt * 10) }
  // 列 l を s の前方 [a, b] m で物 o がふさいでいるか（動く物は今の位置で見る）
  occupies(o, l, s, a, b) {
    if (Math.abs(o.x - l * LX) > 0.85) return false
    if (o.gate && o.st === 'wait') return false
    const ds = o.s - s
    return ds + o.len > a && ds < b
  }
  stepDarts(dt) {
    const d = this.dog, m = this.me
    for (const dz of this.darts) {
      if (dz.st === 'wait' && d.s >= dz.s && !d.dart && m.st === 'run') { dz.st = 'alert'; dz.t = 0; d.dart = dz; this.ev.push({ k: 'alert', id: dz.id, target: dz.target }) }
      if (dz.st === 'done' || dz.st === 'wait') continue
      dz.t += dt
      if (dz.st === 'alert') { d.ears = Math.min(1, d.ears + dt * 6); if (dz.t >= ALERT) { dz.st = 'go'; dz.t = 0; this.ev.push({ k: 'bolt', id: dz.id, target: dz.target }) } }
      else if (dz.st === 'go') {
        d.ears = 1; d.happy = 1
        // 犬と違う列にいると、少しして犬の側へ1列ずつ引っぱられる
        if (m.st === 'run' && m.lane !== d.lane && Math.abs(d.x - d.lane * LX) < 0.3) {
          m.yankT += dt
          if (m.yankT > YANK_GRACE) { m.yankT = YANK_GRACE - 0.3; m.prevLane = m.lane; m.lane += sgn(d.lane - m.lane); m.laneT = 0; this.stats.yanks++; this.ev.push({ k: 'yank' }) }
        } else m.yankT = 0
        if (!dz.reached && d.s > dz.ts - 6) { dz.reached = true; this.ev.push({ k: 'reach', id: dz.id, target: dz.target }) }
        if (dz.t >= dz.dur) { dz.st = 'done'; d.dart = null; m.yankT = 0; this.ev.push({ k: 'calm', id: dz.id }) }
      }
    }
    if (!d.dart) d.ears = Math.max(0, d.ears - dt * 2)
  }

  // ---------------------------------------------------------------- 障害物の動きと当たり
  stepOb(o, dt) {
    const m = this.me, d = this.dog, K = OB[o.kind]
    if (o.done) return
    const ahead = o.s - m.s
    o.t += dt
    if (o.st === 'wait') {
      if (K.vs && o.vs0 !== 0 && ahead < (o.kind === 'runner' ? 16 : 30)) { o.st = 'move'; o.vs = K.vs }
      if (K.cross && ahead < this.v * 1.9 + 2) { o.st = 'move'; o.vx = o.dir * 2.4; this.ev.push({ k: 'obStart', id: o.id }) }
      if (K.sweep && ahead < this.v * 1.35 + 1) { o.st = 'move'; o.vx = o.dir * 6.5; this.ev.push({ k: 'obStart', id: o.id }) }
      if (K.gate && ahead < this.v * 1.15 + 3) { o.st = 'move'; this.ev.push({ k: 'obStart', id: o.id }) }
      if (K.fall && ahead < this.v * 0.9 + 2) { o.st = 'move'; this.ev.push({ k: 'obStart', id: o.id }) }
    }
    if (o.st === 'move') {
      o.s += o.vs * dt; o.x += o.vx * dt
      if (K.gate) { o.open = Math.min(1, o.open + dt * 5); o.x = o.side * (LX + 1.6 - o.open * 1.6) }
      if (K.fall) o.fallY = Math.max(0, o.fallY - dt * 11)
      if ((K.cross || K.sweep) && Math.abs(o.x) > 4.6) o.vx = 0
    }
    // 犬が通り過ぎた側（巻きつきの判定に使う）
    if (!o.dogPassed && d.s >= o.s + o.len / 2) { o.dogPassed = true; o.sideD = Math.abs(d.x - o.x) < 0.5 ? 0 : sgn(d.x - o.x) }
    // 自分との当たり
    if (!o.hit && !o.mePassed && m.st === 'run' && m.inv <= 0) {
      const half = K.cross || K.sweep ? 0.62 : K.gate ? 0.8 : o.kind === 'wedding' || o.kind === 'truck' ? 0.78 : 0.68
      const inLane = Math.abs(m.x - o.x) < half
      const overS = m.s + 0.25 > o.s && m.s - 0.25 < o.s + o.len
      if (inLane && overS && (!K.fall || o.fallY < 1.6)) {
        const cleared = o.h === 'low' ? m.y > 0.35 : o.h === 'high' ? (m.duck > 0 && m.y < 0.2) : false
        if (!cleared) { this.hitOb(o, 'hit'); return }
      }
    }
    if (!o.mePassed && m.s - 0.3 > o.s + o.len) {
      o.mePassed = true
      if (!o.hit && m.st === 'run') {
        // 巻きつき: 犬と反対側を通った
        if (o.wrap && o.sideD && m.inv <= 0) {
          const my = sgn(m.x - o.x)
          if (my && my !== o.sideD) { this.hitOb(o, 'wrap'); return }
        }
        // ギリギリ（直前に列を替えた・直前に跳んだ／しゃがんだ）
        const swapped = o.h === 'tall' && m.prevLane === Math.round(o.x / LX) && m.laneT < 0.55 && Math.abs(o.x - m.x) < 1.8
        const jumped = o.h === 'low' && Math.abs(m.x - o.x) < 0.7 && m.jumpT < 0.6
        const ducked = o.h === 'high' && Math.abs(m.x - o.x) < 0.7 && m.duckT0 < 0.55
        if (swapped || jumped || ducked) {
          o.near = true; this.chain++; this.stats.near++; this.stats.bestChain = Math.max(this.stats.bestChain, this.chain)
          m.boost = 1.6; d.happy = 1
          this.ev.push({ k: 'near', id: o.id, chain: this.chain, how: swapped ? 'swap' : jumped ? 'jump' : 'duck' })
        }
      }
    }
    if (o.s + o.len < m.s - 12) o.done = true
  }
  hitOb(o, why) {
    const m = this.me, K = OB[o.kind]
    o.hit = true; o.mePassed = true; o.hitWhy = why
    this.chain = 0; this.stats.hits++; if (why === 'wrap') this.stats.wraps++
    m.st = 'tumble'; m.st_t = 0; m.vy = 0; m.y = 0; m.duck = 0; m.yankT = 0
    if (why === 'wrap') this.wrapped = { o, t: 0 }
    const wrapPerson = why === 'wrap' && o.kind !== 'pole'
    this.pending = { who: K.who, item: o.kind + (why === 'wrap' ? '_wrap' : ''), cost: wrapPerson ? Math.round(K.cost * 1.5 / 1000) * 1000 : K.cost, ob: o.id }
    this.ev.push({ k: 'hit', id: o.id, kind: o.kind, why })
  }

  // ---------------------------------------------------------------- お辞儀（深い所で押すほど許してもらえる）
  // 角度 = 90 * sin^2(pi t / BOW_T)。2往復で押さなければ「無言」
  startBow() {
    const m = this.me
    m.st = 'bow'; m.st_t = 0
    m.lane = clamp(Math.round(m.x / LX), -1, 1)
    this.bow = { t: 0, grade: null, item: this.pending }
    this.pending = null; this.wrapped = null
    this.ev.push({ k: 'bowStart', who: this.bow.item.who })
  }
  static bowAngle(t) { const s = Math.sin(Math.PI * t / BOW_T); return 90 * s * s }
  stepBow(inp) {
    const b = this.bow, m = this.me
    if (!b.grade) {
      b.t += STEP
      m.bowA = Walk.bowAngle(b.t)
      if (inp.bowTap && b.t > 0.06) { const a = m.bowA; b.grade = a >= 74 ? 'deep' : a >= 50 ? 'good' : 'nod'; b.endT = 0 }
      else if (b.t >= BOW_T * 2) { b.grade = 'silent'; b.endT = 0 }
      if (b.grade) {
        const mul = { deep: 0.5, good: 0.75, nod: 1, silent: 1.2 }[b.grade]
        const it = b.item
        this.list.push({ ...it, cost: Math.round(it.cost * mul / 100) * 100, base: it.cost, grade: b.grade })
        this.stats.bows.push(b.grade)
        this.ev.push({ k: 'bowGrade', grade: b.grade })
      }
      return
    }
    b.endT += STEP
    const a = b.grade === 'deep' ? 90 : b.grade === 'good' ? 65 : b.grade === 'nod' ? 25 : 8
    m.bowA += (a - m.bowA) * 0.2
    if (b.endT > 0.55) { m.st = 'getup'; m.st_t = 0; this.bow = null; m.bowA = 0 }
  }

  // ---------------------------------------------------------------- 綱（Verlet。手と首輪。巻きついた時は物の点を通る）
  handPos() { const m = this.me; if (m.st === 'tumble') return { x: m.x, y: 0.3, s: m.s + 0.6 }; if (m.st === 'bow') return { x: m.x + 0.1, y: 0.8, s: m.s + 0.25 }; return { x: m.x + 0.14, y: 0.88 + m.y - (m.duck > 0 ? 0.35 : 0), s: m.s + 0.32 } }
  collarPos() { const d = this.dog; return { x: d.x + Math.sin(d.hd) * 0.62, y: 1.0 + d.y + d.sit * 0.08, s: d.s + Math.cos(d.hd) * 0.62 } }
  stepRope() {
    const R = this.rope, n = R.length, a = this.handPos(), b = this.collarPos()
    const g = -9.8 * STEP * STEP, fwd = this.me.st === 'bow' ? 0 : this.v * STEP
    for (const p of R) {
      const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9, vs = (p.s - p.ps - fwd) * 0.9 + fwd
      p.px = p.x; p.py = p.y; p.ps = p.s
      p.x += vx; p.y += vy + g; p.s += vs
    }
    let pinI = -1, pin = null
    if (this.wrapped) { const o = this.wrapped.o; pinI = 6; pin = { x: o.x, y: 1.0, s: o.s + o.len / 2 } }
    const L = Math.max(LEASH, Math.hypot(b.x - a.x, b.s - a.s) + 0.3), seg = L / (n - 1)
    for (let it = 0; it < 8; it++) {
      R[0].x = a.x; R[0].y = a.y; R[0].s = a.s
      R[n - 1].x = b.x; R[n - 1].y = b.y; R[n - 1].s = b.s
      if (pin) { const q = R[pinI]; q.x = pin.x; q.y = pin.y; q.s = pin.s }
      for (let i = 0; i < n - 1; i++) {
        const p = R[i], q = R[i + 1]
        const dx = q.x - p.x, dy = q.y - p.y, ds = q.s - p.s, Lq = Math.hypot(dx, dy, ds) || 1e-6
        if (Lq <= seg) continue
        const k = (Lq - seg) / Lq
        const fp = i === 0 || i === pinI ? 0 : 1, fq = i + 1 === n - 1 || i + 1 === pinI ? 0 : 1, tot = fp + fq || 1
        p.x += dx * k * fp / tot; p.y += dy * k * fp / tot; p.s += ds * k * fp / tot
        q.x -= dx * k * fq / tot; q.y -= dy * k * fq / tot; q.s -= ds * k * fq / tot
      }
      for (const p of R) if (p.y < 0.03) p.y = 0.03
    }
    this.ropePin = pinI
  }

  finish(home) {
    this.phase = 'end'
    if (this.me.st === 'bow' && this.bow && !this.bow.grade) { const it = this.bow.item; this.list.push({ ...it, cost: Math.round(it.cost * 1.2 / 100) * 100, base: it.cost, grade: 'silent' }) }
    if (!home) {
      const left = Math.max(0, ROUTE - this.me.s)
      this.list.push({ who: 'family', item: 'pickup', cost: 30000 + Math.round(left * 40 / 100) * 100, late: true })
    }
    const total = this.list.reduce((a, b) => a + b.cost, 0)
    const bad = this.list.filter(x => !x.good).length
    let rank
    if (home && bad === 0) rank = 0
    else if (total <= 15000) rank = 1
    else if (total <= 45000) rank = 2
    else if (total <= 100000) rank = 3
    else rank = 4
    this.result = { home, total, bad, rank, time: this.t, medal: this.medal, wallet: this.wallet, list: this.list.slice(), stats: this.stats, dist: Math.min(ROUTE, this.me.s) }
    this.ev.push({ k: 'end', home })
  }
}
