// 四つ足の動物を1枚の骨入りメッシュ（SkinnedMesh）で作る。箱や球を組まず、断面をつないだ胴・頭・脚を
// なめらかな1枚の形にして、骨（腰・胸・首・頭・耳・脚2節・しっぽ2節）で動かす
// 見た目は Kenney Mini（ずんぐり・角の丸い四角の断面・単色の塗り分け）に合わせる
import * as THREE from 'three'

// ---------------------------------------------------------------- 断面をつないだ筒
class Builder {
  constructor() { this.pos = []; this.col = []; this.si = []; this.sw = []; this.idx = [] }
  vert(p, c, sk) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); this.si.push(sk[0], sk[1], 0, 0); this.sw.push(1 - sk[2], sk[2], 0, 0); return this.pos.length / 3 - 1 }
  // rings: [{ p:[x,y,z], a, b, bone:[b1,b2,w2] , col }]。ref は断面の横向きを決める基準
  tube(rings, o = {}) {
    const N = o.seg || 12, e = o.sq || 2.6, ref = new THREE.Vector3(...(o.ref || [0, 1, 0]))
    const colOf = o.colOf || ((ring) => ring.col)
    const R = rings.map(r => ({ ...r, p: new THREE.Vector3(...r.p) }))
    // 丸い端（断面を小さくしながら少し伸ばす）
    const capRings = (r, dir, n) => {
      const out = [], rad = Math.min(r.a, r.b)
      for (const [f, sc] of [[0.42, 0.86], [0.75, 0.55]]) out.push({ ...r, p: r.p.clone().addScaledVector(dir, rad * f * (o.capLen || 1)), a: r.a * sc, b: r.b * sc, cap: true })
      out.tip = r.p.clone().addScaledVector(dir, rad * 0.95 * (o.capLen || 1))
      return out
    }
    const t0 = R[1].p.clone().sub(R[0].p).normalize(), t1 = R[R.length - 1].p.clone().sub(R[R.length - 2].p).normalize()
    let rs = R
    let tipA = null, tipB = null
    if (o.capA !== false) { const c = capRings(R[0], t0.clone().negate()); tipA = c.tip; rs = c.reverse().concat(rs) }
    if (o.capB !== false) { const c = capRings(R[R.length - 1], t1); tipB = c.tip; rs = rs.concat(c) }
    const ringIdx = []
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]
      const prev = rs[Math.max(0, i - 1)].p, next = rs[Math.min(rs.length - 1, i + 1)].p
      const T = next.clone().sub(prev).normalize()
      let Nx = new THREE.Vector3().crossVectors(ref, T); if (Nx.lengthSq() < 1e-6) Nx.set(1, 0, 0); Nx.normalize()
      const Bx = new THREE.Vector3().crossVectors(T, Nx).normalize()
      const ids = []
      for (let k = 0; k < N; k++) {
        const th = (k / N) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th)
        const x = r.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), y = r.b * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)
        const p = r.p.clone().addScaledVector(Nx, x).addScaledVector(Bx, y)
        ids.push(this.vert(p, colOf(r, p, x / r.a, y / r.b), r.bone))
      }
      ringIdx.push(ids)
    }
    for (let i = 0; i < ringIdx.length - 1; i++) for (let k = 0; k < N; k++) {
      const a = ringIdx[i][k], b = ringIdx[i][(k + 1) % N], c = ringIdx[i + 1][k], d = ringIdx[i + 1][(k + 1) % N]
      this.idx.push(a, b, c, b, d, c)
    }
    const first = rs[0], last = rs[rs.length - 1]
    if (tipA) { const t = this.vert(tipA, colOf(first, tipA, 0, 0), first.bone); for (let k = 0; k < N; k++) this.idx.push(t, ringIdx[0][(k + 1) % N], ringIdx[0][k]) }
    if (tipB) { const t = this.vert(tipB, colOf(last, tipB, 0, 0), last.bone); const L = ringIdx[ringIdx.length - 1]; for (let k = 0; k < N; k++) this.idx.push(t, L[k], L[(k + 1) % N]) }
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

const C = h => new THREE.Color(h).convertSRGBToLinear()

// ---------------------------------------------------------------- 目の絵（表情ごと）
function eyeTex(expr) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')
  x.lineCap = x.lineJoin = 'round'; const ink = '#1d1410'
  if (expr === 'happy') { x.strokeStyle = ink; x.lineWidth = 15; x.beginPath(); x.moveTo(26, 78); x.quadraticCurveTo(64, 30, 102, 78); x.stroke() }
  else if (expr === 'strain') { x.strokeStyle = ink; x.lineWidth = 14; x.beginPath(); x.moveTo(28, 44); x.lineTo(92, 66); x.lineTo(28, 88); x.stroke() }
  else if (expr === 'shut') { x.strokeStyle = ink; x.lineWidth = 12; x.beginPath(); x.moveTo(28, 70); x.quadraticCurveTo(64, 90, 100, 70); x.stroke() }
  else {
    const big = expr === 'alert', sad = expr === 'sad'
    if (big) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(64, 66, 40, 44, 0, 0, 7); x.fill(); x.strokeStyle = ink; x.lineWidth = 6; x.stroke() }
    x.fillStyle = ink; x.beginPath(); x.ellipse(64, 70, big ? 19 : 26, big ? 22 : 31, 0, 0, 7); x.fill()
    x.fillStyle = '#fff'; x.beginPath(); x.arc(74, 56, big ? 7 : 10, 0, 7); x.fill()
    if (sad) { x.fillStyle = 'rgba(140,200,255,.95)'; x.beginPath(); x.ellipse(50, 112, 8, 13, 0, 0, 7); x.fill() }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function browTex(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d')
  x.lineCap = 'round'; x.strokeStyle = '#3a2412'; x.lineWidth = 12
  if (kind === 'up') { x.beginPath(); x.moveTo(20, 40); x.quadraticCurveTo(64, 6, 108, 34); x.stroke() }
  else if (kind === 'angry') { x.beginPath(); x.moveTo(18, 18); x.lineTo(108, 46); x.stroke() }
  else if (kind === 'sad') { x.beginPath(); x.moveTo(18, 46); x.lineTo(108, 18); x.stroke() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

// ---------------------------------------------------------------- 四つ足
// o: { k: 大きさ, head, muzzle, ear: 'flop'|'point'|'big', tail: 'up'|'long'|'curl', leg, body, fur, light, dark, nose }
export function makeQuadruped(o = {}) {
  const k = o.k ?? 1, hm = o.head ?? 1, mm = o.muzzle ?? 1, lm = o.leg ?? 1, bm = o.body ?? 1
  const fur = C(o.fur ?? 0xd99a45), light = C(o.light ?? 0xf3d39a), dark = C(o.dark ?? 0xb06a28), nose = C(o.nose ?? 0x1d1410)
  // 骨（犬の大きさで置いてから k 倍）
  const B = {}, list = []
  const bone = (name, p, parent) => { const b = new THREE.Bone(); b.name = name; b.userData.w = new THREE.Vector3(...p).multiplyScalar(k); B[name] = b; list.push(b); if (parent) { B[parent].add(b); b.position.copy(b.userData.w).sub(B[parent].userData.w) } else b.position.copy(b.userData.w); return b }
  const H = 0.68, zb = 0.56 * bm
  const headC = [0, H + 0.42 - (1 - hm) * 0.1, zb + 0.14 + 0.05 * hm]
  bone('root', [0, 0, 0])
  bone('hips', [0, H, -zb * 0.48], 'root')
  bone('chest', [0, H + 0.02, zb * 0.48], 'hips')
  bone('neck', [0, H + 0.18, zb * 0.84], 'chest')
  bone('head', headC, 'neck')
  for (const s of [1, -1]) bone('ear' + (s > 0 ? 'L' : 'R'), [s * 0.16 * hm, headC[1] + 0.14 * hm, headC[2] - 0.06 * hm], 'head')
  bone('tail1', [0, H + 0.12, -zb - 0.0], 'hips')
  bone('tail2', [0, H + 0.24, -zb - 0.28], 'tail1')
  const legs = []
  for (const [nm, x, z, par] of [['FL', 0.17, zb * 0.68, 'chest'], ['FR', -0.17, zb * 0.68, 'chest'], ['BL', 0.17, -zb * 0.7, 'hips'], ['BR', -0.17, -zb * 0.7, 'hips']]) {
    bone('leg' + nm + 'u', [x, H - 0.06, z], par); bone('leg' + nm + 'l', [x, 0.34, z + (nm[0] === 'F' ? 0.02 : -0.04)], 'leg' + nm + 'u'); legs.push(nm)
  }
  const bi = n => list.indexOf(B[n])
  const P = (x, y, z) => [x * k, y * k, z * k]
  const bd = new Builder()
  const ring = (p, a, b, b1, b2 = b1, w = 0, col = fur) => ({ p, a: a * k, b: b * k, bone: [bi(b1), bi(b2), w], col })
  // 胴（おなかと胸は明るい色）
  const g = 0.3
  bd.tube([
    ring(P(0, H + 0.05, -zb), g * 0.6, g * 0.62, 'hips'),
    ring(P(0, H + 0.03, -zb * 0.78), g * 0.92, g * 0.97, 'hips'),
    ring(P(0, H, -zb * 0.32), g, g * 1.0, 'hips'),
    ring(P(0, H - 0.01, zb * 0.12), g * 0.98, g * 0.99, 'hips', 'chest', 0.5),
    ring(P(0, H + 0.02, zb * 0.52), g * 1.05, g * 1.1, 'chest'),
    ring(P(0, H + 0.08, zb * 0.84), g * 0.9, g * 1.04, 'chest'),
    ring(P(0, H + 0.17, zb * 1.0), g * 0.6, g * 0.72, 'chest', 'neck', 0.3),
  ], { ref: [0, 0, 1], sq: 2.7, colOf: (r, p, nx, ny) => (ny < -0.62 || (p.z > zb * 0.8 * k && ny < -0.05 && Math.abs(nx) < 0.55)) ? light : fur })
  // 首と頭
  bd.tube([
    ring(P(0, H + 0.1, zb * 0.82), 0.17, 0.18, 'chest'),
    ring(P(0, H + 0.26, zb * 0.95), 0.15 * hm, 0.16 * hm, 'neck'),
    ring(P(0, headC[1] - 0.04, headC[2] - 0.02), 0.15 * hm, 0.16 * hm, 'head'),
  ], { capA: false, capB: false, ref: [1, 0, 0], colOf: (r, p, nx, ny) => ny < -0.3 ? light : fur })
  const hz = headC[2], hy = headC[1]
  bd.tube([
    ring(P(0, hy + 0.01, hz - 0.2 * hm), 0.12 * hm, 0.12 * hm, 'head'),
    ring(P(0, hy + 0.03, hz - 0.12 * hm), 0.19 * hm, 0.185 * hm, 'head'),
    ring(P(0, hy + 0.03, hz), 0.21 * hm, 0.195 * hm, 'head'),
    ring(P(0, hy + 0.01, hz + 0.1 * hm), 0.18 * hm, 0.165 * hm, 'head'),
    ring(P(0, hy - 0.02, hz + 0.16 * hm), 0.13 * hm, 0.12 * hm, 'head'),
  ], { ref: [0, 1, 0], sq: 2.4, colOf: () => fur })
  // 鼻先（口まわりは明るい）と鼻
  const mz = hz + 0.08 * hm, my = hy - 0.08 * hm, ml = 0.24 * mm * hm
  bd.tube([
    ring(P(0, my, mz), 0.12 * hm, 0.095 * hm, 'head', 'head', 0, light),
    ring(P(0, my - 0.01, mz + ml * 0.55), 0.105 * hm, 0.085 * hm, 'head', 'head', 0, light),
    ring(P(0, my - 0.015, mz + ml), 0.09 * hm, 0.072 * hm, 'head', 'head', 0, light),
  ], { capA: false, ref: [0, 1, 0], sq: 2.3 })
  bd.tube([
    ring(P(0, my + 0.03 * hm, mz + ml + 0.005), 0.05 * hm, 0.036 * hm, 'head', 'head', 0, nose),
    ring(P(0, my + 0.03 * hm, mz + ml + 0.035 * hm), 0.045 * hm, 0.032 * hm, 'head', 'head', 0, nose),
  ], { ref: [0, 1, 0] })
  // 耳
  for (const s of [1, -1]) {
    const e = 'ear' + (s > 0 ? 'L' : 'R'), ex = s * 0.16 * hm, ey = hy + 0.14 * hm, ez = hz - 0.06 * hm
    if ((o.ear ?? 'flop') === 'flop') {
      bd.tube([
        ring(P(ex, ey, ez), 0.04 * hm, 0.08 * hm, e, e, 0, dark),
        ring(P(ex + s * 0.07 * hm, ey - 0.12 * hm, ez + 0.01), 0.035 * hm, 0.095 * hm, e, e, 0, dark),
        ring(P(ex + s * 0.08 * hm, ey - 0.27 * hm, ez + 0.02), 0.03 * hm, 0.075 * hm, e, e, 0, dark),
      ], { ref: [0, 0, 1], seg: 10 })
    } else {
      const big = o.ear === 'big' ? 1.6 : 1
      bd.tube([
        ring(P(ex, ey - 0.02, ez), 0.035 * hm, 0.07 * hm * big, e, e, 0, fur),
        ring(P(ex + s * 0.04 * hm * big, ey + 0.09 * hm * big, ez - 0.01), 0.025 * hm, 0.05 * hm * big, e, e, 0, light),
        ring(P(ex + s * 0.06 * hm * big, ey + 0.18 * hm * big, ez - 0.02), 0.012 * hm, 0.015 * hm, e, e, 0, fur),
      ], { ref: [0, 0, 1], seg: 8, capLen: 0.6 })
    }
  }
  // 脚と足
  for (const nm of legs) {
    const u = B['leg' + nm + 'u'].userData.w.clone().divideScalar(k), l = B['leg' + nm + 'l'].userData.w.clone().divideScalar(k)
    const up = 'leg' + nm + 'u', lo = 'leg' + nm + 'l', r = 0.09 * lm, back = nm[0] === 'B'
    bd.tube([
      ring(P(u.x, H + 0.04, u.z), r * (back ? 1.3 : 1.2), r * (back ? 1.4 : 1.25), up),
      ring(P(u.x, (H + 0.34) / 2, (u.z + l.z) / 2 + (back ? -0.03 : 0)), r * (back ? 1.15 : 1.0), r * (back ? 1.25 : 1.05), up),
      ring(P(l.x, 0.34, l.z), r * 0.9, r * 0.92, up, lo, 0.5),
      ring(P(l.x, 0.13, l.z + 0.02), r * 0.84, r * 0.84, lo),
    ], { capA: false, capB: false, ref: [0, 0, 1], seg: 10 })
    bd.tube([
      ring(P(l.x, 0.075, l.z - 0.03), r * 0.95, r * 0.7, lo, lo, 0, light),
      ring(P(l.x, 0.07, l.z + 0.06), r * 0.98, r * 0.66, lo, lo, 0, light),
      ring(P(l.x, 0.06, l.z + 0.13), r * 0.86, r * 0.56, lo, lo, 0, light),
    ], { ref: [0, 1, 0], seg: 10 })
  }
  // しっぽ
  const tl = o.tail ?? 'up'
  const tailPts = tl === 'long' ? [[0, H + 0.04, -zb - 0.02], [0, H + 0.14, -zb - 0.32], [0, H + 0.36, -zb - 0.55], [0, H + 0.62, -zb - 0.62]]
    : tl === 'curl' ? [[0, H + 0.08, -zb], [0, H + 0.28, -zb - 0.08], [0, H + 0.36, -zb + 0.06]]
    : [[0, H + 0.1, -zb + 0.02], [0, H + 0.18, -zb - 0.18], [0, H + 0.3, -zb - 0.34], [0, H + 0.38, -zb - 0.46]]
  bd.tube(tailPts.map((p, i, a) => ring(P(...p), (tl === 'long' ? 0.045 : 0.075) * (1 - i / a.length * 0.45), (tl === 'long' ? 0.045 : 0.08) * (1 - i / a.length * 0.45), i < a.length / 2 ? 'tail1' : 'tail2', i < a.length / 2 ? 'tail1' : 'tail2', 0, i === a.length - 1 && tl === 'up' ? light : fur)), { ref: [1, 0, 0], seg: 8 })

  const geo = bd.geometry()
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 })
  const mesh = new THREE.SkinnedMesh(geo, mat)
  mesh.add(B.root)
  mesh.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(list)
  mesh.bind(skeleton)
  mesh.castShadow = true; mesh.frustumCulled = false
  // 目と眉: 頭の前の面に貼る（光で決める）
  const eyes = [], brows = []
  const ray = new THREE.Raycaster(), probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  probe.updateMatrixWorld(true)
  const faces = {}
  for (const ex of ['normal', 'alert', 'happy', 'strain', 'sad', 'shut']) faces[ex] = eyeTex(ex)
  const browsT = { none: null, up: browTex('up'), angry: browTex('angry'), sad: browTex('sad') }
  const eyeMat = new THREE.MeshBasicMaterial({ map: faces.normal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
  const browMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 })
  for (const s of [1, -1]) {
    const from = new THREE.Vector3(s * 0.1 * hm * k, (hy + 0.085 * hm) * k, (hz + 1.5) * k)
    ray.set(from, new THREE.Vector3(0, -0.05, -1).normalize())
    const hit = ray.intersectObject(probe)[0]
    if (!hit) continue
    const n = hit.face.normal.clone()
    const size = 0.105 * hm * k
    const em = new THREE.Mesh(new THREE.PlaneGeometry(size, size), eyeMat)
    em.position.copy(hit.point).addScaledVector(n, 0.012 * k).sub(B.head.userData.w)
    em.lookAt(em.position.clone().add(n)); if (s < 0) em.scale.x = -1
    em.renderOrder = 2; B.head.add(em); eyes.push(em)
    const bm2 = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.1, size * 0.55), browMat)
    bm2.position.copy(em.position).add(new THREE.Vector3(0, size * 0.62, 0.004 * k)); bm2.quaternion.copy(em.quaternion); if (s < 0) bm2.scale.x = -1
    bm2.renderOrder = 2; B.head.add(bm2); brows.push(bm2)
  }
  const group = new THREE.Group(); group.add(mesh)
  return { group, mesh, bones: B, skeleton, eyeMat, browMat, faces, browsT, headC: new THREE.Vector3(...headC).multiplyScalar(k), mouth: new THREE.Vector3(0, my - 0.07 * hm, mz + ml * 0.6).multiplyScalar(k), k }
}

// ---------------------------------------------------------------- 大型犬（ゴールデン）。走る・跳ぶ・座る・耳が立つ・表情
export class BigDog {
  constructor() {
    const q = this.q = makeQuadruped({ k: 1, fur: 0xe9c595, light: 0xfaf0e0, dark: 0xc98f55 })
    this.group = q.group; this.body = q.bones.hips; this.head = q.bones.head; this.B = q.bones
    // 舌（口の下にぶら下がる）
    const tg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xe8687a, roughness: 0.6 }))
    tg.scale.set(1.2, 1, 0.45); tg.position.copy(q.mouth).sub(q.bones.head.userData.w).add(new THREE.Vector3(0.03, -0.02, 0)); tg.rotation.x = 0.5
    q.bones.head.add(tg); this.tongue = tg
    // 首輪と札
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.03, 8, 22), new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.55 }))
    col.position.set(0, -0.02, 0.0); col.rotation.x = -1.1; q.bones.neck.add(col); this.collar = col
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 14), new THREE.MeshStandardMaterial({ color: 0xf2c84b, roughness: 0.35, metalness: 0.6 }))
    tag.rotation.x = Math.PI / 2; tag.position.set(0, -0.19, 0.02); col.add(tag)
    // 洗濯物のシャツ（物干し竿の下をくぐると、たまに着て出てくる）
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.62, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4f8fd6, roughness: 0.85, side: THREE.DoubleSide }))
    shirt.rotation.x = Math.PI / 2; shirt.position.set(0, 0.03, 0.05); shirt.visible = false; q.bones.chest.add(shirt); this.shirt = shirt
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.355, 0.09, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide })); shirt.add(stripe)
    // くわえる財布
    const wallet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.13), new THREE.MeshStandardMaterial({ color: 0x6a3a1c, roughness: 0.6 }))
    wallet.position.copy(q.mouth).sub(q.bones.head.userData.w).add(new THREE.Vector3(0, 0.0, 0.02)); wallet.visible = false; q.bones.head.add(wallet); this.wallet = wallet
    this.group.traverse(o => { if (o.isMesh && o.material && !o.material.transparent) o.castShadow = true })
    this.phase = 0; this.wag = 0; this.expr = 'normal'
    this.rest = {}; for (const [n, b] of Object.entries(q.bones)) this.rest[n] = b.position.clone()
  }
  setExpr(e) {
    if (e === this.expr) return; this.expr = e
    const q = this.q, f = { normal: 'normal', alert: 'alert', happy: 'happy', strain: 'strain', sad: 'sad', shut: 'shut' }[e] || 'normal'
    q.eyeMat.map = q.faces[f]; q.eyeMat.needsUpdate = true
    const br = e === 'alert' ? 'up' : e === 'strain' ? 'angry' : e === 'sad' ? 'sad' : 'none'
    q.browMat.map = q.browsT[br]; q.browMat.opacity = q.browsT[br] ? 1 : 0; q.browMat.needsUpdate = true
  }
  // o: { speed, ears 0..1, look rad, sit 0..1, happy, air(跳んでいる), lean 横の傾き, shirt }
  pose(dt, o) {
    const B = this.B, sp = o.speed || 0
    this.phase += dt * (3 + sp * 1.25)
    const ph = this.phase, sit = o.sit || 0, run = sp > 2.5 ? 1 : sp / 2.5
    const air = o.air ? 1 : 0
    // 走り（ギャロップ: 前脚どうし・後ろ脚どうしが少しずれて動く）
    const amp = (0.25 + run * 0.55) * (1 - sit) * (1 - air * 0.7)
    const legs = [['FL', 0, 1], ['FR', 0.35, 1], ['BL', Math.PI, -1], ['BR', Math.PI + 0.35, -1]]
    for (const [n, off, f] of legs) {
      const u = B['leg' + n + 'u'], l = B['leg' + n + 'l']
      const a = Math.sin(ph + off)
      u.rotation.x = a * amp * (f > 0 ? 1 : 0.9) + (air ? (f > 0 ? -0.7 : 0.8) : 0)
      l.rotation.x = (f > 0 ? Math.max(0, -Math.cos(ph + off)) * 0.9 : -Math.max(0, Math.cos(ph + off)) * 0.8) * amp + (air ? (f > 0 ? 0.9 : -0.6) : 0)
    }
    // 座る: 後ろ脚をたたんで体を起こす
    if (sit > 0) {
      B.legBLu.rotation.x += -sit * 1.2; B.legBRu.rotation.x += -sit * 1.2
      B.legBLl.rotation.x += sit * 2.0; B.legBRl.rotation.x += sit * 2.0
      B.legFLu.rotation.x += sit * 0.45; B.legFRu.rotation.x += sit * 0.45
    }
    B.hips.rotation.x = -sit * 0.6 + Math.sin(ph * 2) * 0.05 * run * (1 - air)
    B.hips.position.y = this.rest.hips.y - sit * 0.24 + Math.abs(Math.sin(ph)) * 0.07 * run * (1 - air) + (o.y || 0)
    B.hips.rotation.z = (o.lean || 0) * 0.25
    B.chest.rotation.x = -Math.sin(ph * 2 + 0.6) * 0.06 * run + sit * 0.15
    // 首と頭: 見る方へ
    B.neck.rotation.y = THREE.MathUtils.clamp(o.look || 0, -0.8, 0.8) * 0.6
    B.head.rotation.y = THREE.MathUtils.clamp(o.look || 0, -0.8, 0.8) * 0.4
    B.neck.rotation.x = -(o.ears || 0) * 0.25 + sit * 0.3 + Math.sin(ph * 2) * 0.04 * run
    // 耳: 0=垂れて揺れる、1=前へ立つ
    const e = o.ears || 0
    for (const [n, s] of [['earL', 1], ['earR', -1]]) {
      const b = B[n]
      b.rotation.z = s * (0.15 + Math.sin(ph * 0.5 + s) * 0.18 * run) * (1 - e) + s * e * 0.2
      b.rotation.x = -e * 0.9 + Math.sin(ph) * 0.15 * run * (1 - e)
    }
    // しっぽ
    this.wag += dt * (o.happy ? 20 : 7 + run * 4)
    B.tail1.rotation.y = Math.sin(this.wag) * (o.happy ? 0.8 : 0.3)
    B.tail1.rotation.x = -0.2 - e * 0.5 + run * 0.15
    B.tail2.rotation.y = Math.sin(this.wag - 0.8) * (o.happy ? 0.5 : 0.2)
    this.tongue.visible = sp > 3 || o.happy > 0.3
    this.tongue.rotation.z = Math.sin(ph) * 0.2
    this.shirt.visible = !!o.shirt
  }
}

// 猫（寝ている／塀の上）。同じ作りで小さく
export function makeCat(o = {}) {
  const q = makeQuadruped({ k: 0.34, head: 1.35, muzzle: 0.3, ear: 'point', tail: 'long', leg: 0.75, body: 1.05, fur: o.fur ?? 0x3a3a3c, light: o.light ?? 0xf2efe8, dark: 0x2a2a2c, nose: 0xe88a9a })
  q.sleep = v => {   // 丸くなって寝る
    const B = q.bones
    for (const n of ['FL', 'FR', 'BL', 'BR']) { B['leg' + n + 'u'].rotation.x = n[0] === 'F' ? -1.3 * v : 1.3 * v; B['leg' + n + 'l'].rotation.x = n[0] === 'F' ? 1.2 * v : -1.4 * v }
    B.hips.position.y = q.bones.hips.userData.w.y - 0.16 * v * 0.34 / 0.34 * 0.34
    B.tail1.rotation.y = 1.2 * v; B.tail2.rotation.y = 1.0 * v; B.tail1.rotation.x = 1.2 * v
    B.neck.rotation.x = 0.5 * v
  }
  return q
}
export function makeChihuahua() {
  const q = makeQuadruped({ k: 0.3, head: 1.55, muzzle: 0.55, ear: 'big', tail: 'curl', leg: 0.7, body: 0.85, fur: 0xe8c39a, light: 0xf6e2c4, dark: 0xb08050 })
  // セーター
  const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.24, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xd84b8a, roughness: 0.9, side: THREE.DoubleSide }))
  sw.rotation.x = Math.PI / 2; sw.position.set(0, 0.0, 0.0); q.bones.chest.add(sw)
  return q
}
// 鳩（体と頭をつないだ1枚。脚は短い棒）
export function makePigeon() {
  const bd = new Builder(), g = C(0x8d93a0), nk = C(0x5f7d6e), w = C(0x6a707c), bk = C(0xe0b080)
  const r = (p, a, b, col) => ({ p, a, b, bone: [0, 0, 0], col })
  bd.tube([r([0, 0.12, -0.12], 0.03, 0.03, w), r([0, 0.13, -0.05], 0.07, 0.065, g), r([0, 0.14, 0.04], 0.075, 0.075, g), r([0, 0.2, 0.09], 0.05, 0.05, nk), r([0, 0.27, 0.11], 0.045, 0.045, g)], { ref: [1, 0, 0], seg: 10 })
  bd.tube([r([0, 0.27, 0.15], 0.012, 0.012, bk), r([0, 0.265, 0.18], 0.008, 0.008, bk)], { ref: [0, 1, 0], seg: 6 })
  const geo = bd.geometry()
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
  const group = new THREE.Group(); group.add(mesh)
  const wingGeo = new THREE.SphereGeometry(0.06, 8, 6); wingGeo.scale(0.25, 0.7, 1.4)
  const wl = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x6a707c, roughness: 0.85 })); wl.position.set(0.065, 0.15, -0.02); group.add(wl)
  const wr = wl.clone(); wr.position.x = -0.065; group.add(wr)
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xc86a6a })); l.position.set(s * 0.025, 0.04, 0); group.add(l) }
  group.userData.wings = [wl, wr]
  group.traverse(o => { if (o.isMesh) o.castShadow = true })
  return group
}
