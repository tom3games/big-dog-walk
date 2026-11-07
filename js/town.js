// 夕方の住宅街。sim の props（電柱・植木鉢・自転車…）と出来事の相手を three.js に置く
// 座標: sim の (x, s) → three の (x, y, -s)
import * as THREE from 'three'
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js'
import { surfaceTex, addBlobShadow } from './look.js?v=1'
import { ROUTE, mulberry32 } from './sim.js?v=1'
import { makeCat, makeChihuahua, makePigeon } from './dog3d.js?v=1'

const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))
const matCache = new Map()
const M = (c, r = 0.85, extra = {}) => { const k = c + ':' + r + JSON.stringify(extra); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra })); return matCache.get(k) }
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m }

// 空（夕焼けのグラデーション）
function skyTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#2f3d6e'); g.addColorStop(0.38, '#7d6a9a'); g.addColorStop(0.62, '#e99a74'); g.addColorStop(0.78, '#f7c27a'); g.addColorStop(1, '#f7d9a0')
  x.fillStyle = g; x.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}

// 文字の板（表札・住所表示・看板）
export function textPlate(lines, o = {}) {
  const W = o.w ?? 256, H = o.h ?? 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')
  x.fillStyle = o.bg ?? '#1f4f9a'; x.fillRect(0, 0, W, H)
  if (o.border) { x.strokeStyle = o.border; x.lineWidth = 8; x.strokeRect(6, 6, W - 12, H - 12) }
  x.fillStyle = o.fg ?? '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'
  const n = lines.length
  lines.forEach((l, i) => { x.font = `${o.weight ?? 700} ${o.size ?? 40}px "BIZ UDPGothic", "Hiragino Sans", sans-serif`; x.fillText(l, W / 2, H * (i + 0.5) / n + (o.dy ?? 0)) })
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })
}

export function buildTown(scene, w, o = {}) {
  const rng = mulberry32(w.seed * 97 + 5)
  const R = (a, b) => a + (b - a) * rng()
  const root = new THREE.Group(); scene.add(root)
  const stat = new THREE.Group(); root.add(stat)   // 動かない物（あとで材質ごとに1つにまとめる）
  const LEN = ROUTE + 70, Z0 = 20
  // ---- 空と霧
  scene.background = new THREE.Color(0xe9b98a)
  scene.fog = new THREE.Fog(0xe8b48c, 26, 70)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }))
  sky.renderOrder = -10; root.add(sky); scene.userData.sky = sky
  // ---- 道（アスファルト・白線・側溝）
  const asph = surfaceTex({ w: 256, h: 256, base: '#5d5b5d', noise: 0.16, grime: 0.12, repeat: [1.6, LEN / 4.5], seed: 3,
    draw: (x, W, H, r) => { for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * W, r() * H, 2, 2) } x.strokeStyle = 'rgba(30,30,30,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(r() * W, 0); for (let k = 0; k < 6; k++) x.lineTo(r() * W, k * H / 5); x.stroke() } })
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, LEN), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.95 }))
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, Z0 - LEN / 2); road.receiveShadow = true; root.add(road)
  const lineM = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.7 })
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, LEN), lineM); l.rotation.x = -Math.PI / 2; l.position.set(s * 2.95, 0.004, Z0 - LEN / 2); l.receiveShadow = true; root.add(l)
    const gut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, LEN), M(0x9b9790, 0.9)); gut.position.set(s * 3.38, 0.03, Z0 - LEN / 2); gut.receiveShadow = true; root.add(gut)
  }
  // 「止まれ」の路面文字と、マンホール
  const tomare = textPlate(['止まれ'], { bg: 'rgba(0,0,0,0)', fg: '#f2efe4', w: 256, h: 512, size: 150, dy: 0 })
  tomare.transparent = true; tomare.depthWrite = false
  for (let s = 60; s < ROUTE; s += 75) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), tomare); p.rotation.x = -Math.PI / 2; p.position.set(-1.2, 0.006, -s); stat.add(p) }
  for (let s = 18; s < ROUTE; s += R(25, 40)) { const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 20), M(0x3f3d3c, 0.6, { metalness: 0.3 })); mh.position.set(R(-1.2, 1.2), 0.01, -s); mh.receiveShadow = true; stat.add(mh) }

  // ---- 塀と家（左右）
  const blockTex = surfaceTex({ w: 256, h: 128, base: '#a9a49a', noise: 0.08, grime: 0.18, repeat: [1, 1], seed: 9,
    draw: (x, W, H) => { x.strokeStyle = 'rgba(70,64,58,.55)'; x.lineWidth = 3; for (let r = 0; r <= 3; r++) { x.beginPath(); x.moveTo(0, r * H / 3); x.lineTo(W, r * H / 3); x.stroke(); for (let k = 0; k <= 4; k++) { const xx = (k + (r % 2) * 0.5) * W / 4; x.beginPath(); x.moveTo(xx, r * H / 3); x.lineTo(xx, (r + 1) * H / 3); x.stroke() } } } })
  blockTex.wrapS = blockTex.wrapT = THREE.RepeatWrapping
  const wallM = new THREE.MeshStandardMaterial({ map: blockTex, roughness: 0.95 })
  const wallGeo = len => { const g = new THREE.BoxGeometry(0.2, 1.15, len), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 1.6); return g }
  const houseCols = [0xeee4d2, 0xd9d4cb, 0xc9b49a, 0xb9c6cc, 0xe3cfa8, 0xa88f78, 0xf1ebe0, 0xcfd6c4]
  const roofCols = [0x4b4f5a, 0x7a3f32, 0x39465a, 0x5b5b55, 0x6b4a3a]
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe2a6, emissive: 0xffc46a, emissiveIntensity: 0.9, roughness: 0.5 })
  const winOff = new THREE.MeshStandardMaterial({ color: 0x51627a, roughness: 0.3, metalness: 0.2 })
  const nameMat = textPlate(['ムギ'], { bg: '#efe6d2', fg: '#2a2520', w: 128, h: 256, size: 70, border: '#7a6650' })
  const gaps = []   // 家の門（塀の切れ目）。出来事の相手が出てくる所
  for (const side of [-1, 1]) {
    let s = -12
    while (s < ROUTE + 30) {
      const lot = R(8, 11), gate = R(1.4, 1.8), gs = s + R(1.5, lot - gate - 1.5)
      // 塀（門の手前と奥）
      for (const [a, b] of [[s, gs], [gs + gate, s + lot]]) {
        const L = b - a; if (L < 0.2) continue
        const wm = new THREE.Mesh(wallGeo(L), wallM); wm.position.set(side * 3.68, 0.575, -(a + L / 2)); wm.castShadow = wm.receiveShadow = true; stat.add(wm)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, L), M(0x8e8a82, 0.9)); cap.position.set(side * 3.68, 1.18, -(a + L / 2)); cap.receiveShadow = true; stat.add(cap)
      }
      gaps.push({ side, s: gs + gate / 2 })
      // 門柱と表札
      for (const k of [0, 1]) mesh(new THREE.BoxGeometry(0.3, 1.35, 0.3), M(0x8c8378, 0.9), side * 3.68, 0.675, -(gs + k * gate), stat)
      // 家
      const hw = R(6, Math.min(8.5, lot - 0.6)), hd = R(5.5, 7), hh = R(4.8, 6.2), hx = side * (3.9 + 1.2 + hd / 2), hs = s + lot / 2
      const col = houseCols[Math.floor(rng() * houseCols.length)]
      const body = mesh(new THREE.BoxGeometry(hd, hh, hw), M(col, 0.9), hx, hh / 2, -hs, stat)
      // 切妻屋根（道に向かって傾く2枚）
      const rc = M(roofCols[Math.floor(rng() * roofCols.length)], 0.75)
      const rise = R(1.3, 2.0), half = hd / 2 + 0.4, slope = Math.hypot(half, rise)
      for (const k of [-1, 1]) {
        const r = mesh(new THREE.BoxGeometry(slope, 0.16, hw + 0.6), rc, hx + k * half / 2, hh + rise / 2, -hs, stat)
        r.rotation.z = -k * Math.atan2(rise, half)
      }
      const gable = new THREE.Shape(); gable.moveTo(-hd / 2, 0); gable.lineTo(hd / 2, 0); gable.lineTo(0, rise); gable.closePath()
      for (const k of [-1, 1]) { const gm = mesh(new THREE.ShapeGeometry(gable), M(col, 0.9), hx, hh, -hs + k * hw / 2 * 1.001, stat); if (k < 0) gm.rotation.y = Math.PI }
      // 道に面した窓（夕方なので半分は明かり）
      const fx = hx - side * (hd / 2 + 0.01)
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        if (rng() < 0.25) continue
        const wv = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), rng() < 0.55 ? winMat : winOff)
        wv.position.set(fx, 1.5 + j * 2.1, -(hs - hw / 2 + (i + 0.5) * hw / 3)); wv.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; stat.add(wv)
      }
      // 庭の木（塀の向こう）
      if (rng() < 0.55) {
        const tx = side * R(4.2, 4.7), ts = s + R(0.5, lot - 0.5)
        mesh(new THREE.CylinderGeometry(0.08, 0.12, 2, 6), M(0x6a4a33), tx, 1, -ts, stat)
        const lc = [0x4f7d3c, 0x5d8a44, 0x3f6b37][Math.floor(rng() * 3)]
        for (let k = 0; k < 3; k++) mesh(new THREE.IcosahedronGeometry(R(0.6, 0.9), 1), M(lc, 0.9), tx + R(-0.3, 0.3), 2.2 + R(0, 0.7), -ts + R(-0.4, 0.4), stat)
      }
      s += lot
    }
  }
  mergeStatic(stat)
  // ---- 家（ゴール）: 道の突き当たり
  const home = new THREE.Group(); home.position.set(0, 0, -(ROUTE + 6)); root.add(home)
  mesh(new THREE.BoxGeometry(9, 5.4, 5), M(0xf3e7cf), 0, 2.7, -1, home)
  for (const k of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(5.3, 0.18, 6), M(0x7a3f32, 0.7), k * 2.3, 6.2, -1, home); r.rotation.z = -k * 0.55 }
  const door = mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), M(0x7a5032), 0, 1.1, 1.52, home)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xffe7b0, emissive: 0xffb84a, emissiveIntensity: 2 })); lamp.position.set(1, 2.5, 1.55); home.add(lamp)
  const np = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.56), nameMat); np.position.set(-1, 1.6, 1.56); home.add(np)
  for (const k of [-1, 1]) { const wv = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), winMat); wv.position.set(k * 3, 1.8, 1.52); home.add(wv); const w2 = wv.clone(); w2.position.y = 4; home.add(w2) }
  const homeLight = new THREE.PointLight(0xffb86a, 6, 9, 2); homeLight.position.set(0, 2.6, 2.5); home.add(homeLight)

  // ---- 物（sim の props）
  const props = new Map()
  const poles = []
  for (const p of w.props) {
    const g = new THREE.Group(); g.position.set(p.x, 0, -p.s); root.add(g)
    const it = { p, g, kind: p.kind }
    if (p.kind === 'pole') {
      const shaft = mesh(new THREE.CylinderGeometry(0.15, 0.2, 8.5, 12), M(0xb3aea4, 0.85), 0, 4.25, 0, g)
      mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), M(0x6e6a62), 0, 7.6, 0, g)
      if (rng() < 0.4) mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), M(0x8f9592, 0.5, { metalness: 0.3 }), -Math.sign(p.x) * 0.35, 6.6, 0, g)
      // 住所の青い板（電柱の道側）
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.9), textPlate(['ムギ町', String(1 + Math.floor(p.s / 60)) + '丁目'], { w: 96, h: 300, size: 30, bg: '#1d4f9c' }))
      plate.position.set(-Math.sign(p.x) * 0.21, 2.2, 0); plate.rotation.y = -Math.sign(p.x) * Math.PI / 2; g.add(plate)
      // 黄色と黒の巻き（根元の反射板）
      mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.9, 12, 1, true), M(0xe8c23a, 0.6), 0, 1.0, 0, g)
      it.glowMat = shaft.material = shaft.material.clone()
      poles.push(it)
    } else if (p.kind === 'tree') {
      mesh(new THREE.BoxGeometry(1, 0.35, 1), M(0x8e8a82), 0, 0.17, 0, g)
      const tr = mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 8), M(0x6a4a33), 0, 1.4, 0, g)
      for (let k = 0; k < 4; k++) mesh(new THREE.IcosahedronGeometry(R(0.7, 1), 1), M(0x4f7d3c, 0.9), R(-0.4, 0.4), 2.9 + R(0, 0.8), R(-0.4, 0.4), g)
      it.glowMat = tr.material = tr.material.clone()
    } else if (p.kind === 'post') {
      const post = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8), M(0xf0eee8, 0.5), 0, 0.47, 0, g)
      if (w.props[p.id + 1] && w.props[p.id + 1].kind === 'post' && w.props[p.id + 1].rail === p.rail) {
        for (const y of [0.6, 0.85]) mesh(new THREE.BoxGeometry(0.06, 0.16, 1.5), M(0xf3f1ec, 0.4), -Math.sign(p.x) * 0.05, y, -0.75, g)
      }
      it.glowMat = post.material = post.material.clone()
    } else if (p.kind === 'pots') {
      it.parts = []
      for (let k = 0; k < 3; k++) {
        const pg = new THREE.Group(); pg.position.set(R(-0.15, 0.15), 0, (k - 1) * 0.32); g.add(pg)
        mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.26, 10), M(0xb5653a, 0.8), 0, 0.13, 0, pg)
        mesh(new THREE.IcosahedronGeometry(0.16, 1), M(0x4f8a3c), 0, 0.34, 0, pg)
        const fl = [0xe0405a, 0xf2c84b, 0xf5f2ec, 0xb85cc8][k % 4]
        for (let j = 0; j < 3; j++) mesh(new THREE.SphereGeometry(0.045, 6, 5), M(fl, 0.6), R(-0.1, 0.1), 0.45 + R(0, 0.06), R(-0.1, 0.1), pg)
        it.parts.push(pg)
      }
    } else if (p.kind === 'bikes') {
      it.parts = []
      for (let k = 0; k < 3; k++) {
        const bg = new THREE.Group(); bg.position.set(0, 0, (k - 1) * 0.45); g.add(bg)
        const piv = new THREE.Group(); bg.add(piv)
        const col = [0x2f6fb5, 0xd0d4d8, 0xc8322a][k]
        for (const zz of [-0.45, 0.45]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 18), M(0x1e1e1e)); wh.position.set(0, 0.32, zz); wh.rotation.y = Math.PI / 2; wh.castShadow = true; piv.add(wh) }
        const fr = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), M(col, 0.5), 0, 0.55, 0, piv)
        mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), M(col, 0.5), 0, 0.5, -0.15, piv)
        mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), M(0x2a2a2a), 0, 0.85, 0.38, piv)
        mesh(new THREE.BoxGeometry(0.16, 0.05, 0.24), M(0x2a2a2a), 0, 0.75, -0.18, piv)
        mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), M(0x9aa0a6, 0.4, { metalness: 0.4 }), 0, 0.82, 0.5, piv)   // かご
        bg.rotation.y = Math.PI / 2 * 0.15
        it.parts.push(piv)
      }
    } else if (p.kind === 'laundry') {
      for (const zz of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), M(0xd8dadc, 0.4, { metalness: 0.4 }), 0, 0.85, zz, g)
      mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), M(0x7fb3d8, 0.4), 0, 1.68, 0, g).rotation.x = Math.PI / 2
      it.parts = []
      const cols = [0xffffff, 0x4f8fd6, 0xe86a7a, 0xf2c84b]
      for (let k = 0; k < 4; k++) { const c = mesh(RB(0.04, 0.55, 0.38, 0.02), M(cols[k], 0.9), 0, 1.38, -0.75 + k * 0.5, g); it.parts.push(c) }
    } else if (p.kind === 'skate') {
      const b = new THREE.Group(); g.add(b); it.board = b
      mesh(RB(0.24, 0.04, 0.8, 0.02), M(0x2b8f7a, 0.6), 0, 0.09, 0, b)
      for (const zz of [-0.28, 0.28]) for (const xx of [-0.09, 0.09]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), M(0xf2e14b, 0.5), xx, 0.035, zz, b).rotation.z = Math.PI / 2
      b.rotation.y = R(-0.5, 0.5)
    } else if (p.kind === 'mailbox') {
      mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 14), M(0xd4302a, 0.5), 0, 0.55, 0, g)
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 14), M(0xd4302a, 0.5), 0, 1.13, 0, g)
      mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), M(0x222222), -Math.sign(p.x) * 0.2, 0.85, 0, g)
    } else if (p.kind === 'vending') {
      mesh(new THREE.BoxGeometry(0.75, 1.85, 1), M(0xe9ecef, 0.5), 0, 0.92, 0, g)
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.1), vendingMat()); panel.position.set(-Math.sign(p.x) * 0.38, 1.15, 0); panel.rotation.y = -Math.sign(p.x) * Math.PI / 2; g.add(panel)
    }
    if (p.wrap) {
      // 巻ける印（足元の輪。届く時だけ光る）
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); it.ring = ring
      // 巻きついたリード（とぐろ）
      const coil = new THREE.Group(); coil.visible = false; g.add(coil); it.coil = coil
      for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(p.kind === 'tree' ? 0.15 : p.kind === 'post' ? 0.09 : 0.22, 0.03, 6, 16), M(0xc8322a, 0.6)); t.rotation.x = Math.PI / 2; t.position.y = 0.85 + k * 0.06; coil.add(t) }
    }
    props.set(p.id, it)
  }
  // 電線（同じ側の電柱どうし）
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0.7 })
  for (const side of [-1, 1]) {
    const ps = poles.filter(i => Math.sign(i.p.x) === side).sort((a, b) => a.p.s - b.p.s)
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i].p, b = ps[i + 1].p
      for (const dx of [-0.6, 0, 0.6]) {
        const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3(a.x + dx, 7.55 - Math.sin(Math.PI * u) * 0.5, -(a.s + (b.s - a.s) * u))) }
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat))
      }
    }
  }

  // ---- 出来事の相手
  const actors = []
  // 相手は近づいてから作る（人の素材は裏で読むので、届いていれば人も出す）
  function makeActor(ev, P) {
    const a = { ev, g: new THREE.Group(), parts: {} }
    a.g.position.set(ev.tx, 0, -ev.ts); root.add(a.g)
    const k = ev.kind
    if (k === 'cat') { const c = makeCat(); c.position.y = 1.21; c.rotation.y = -Math.sign(ev.tx) * Math.PI / 2; a.g.add(c); a.parts.cat = c }
    if (k === 'pigeon') { a.parts.birds = []; for (let i = 0; i < 6; i++) { const b = makePigeon(); b.scale.setScalar(1.7); b.position.set(R(-1.1, 1.1), 0, R(-0.8, 0.8)); b.rotation.y = R(0, 6.28); a.g.add(b); a.parts.birds.push(b) } }
    if (k === 'smalldog') {
      const c = makeChihuahua(); c.position.set(-Math.sign(ev.tx) * 0.5, 0, 0.2); c.rotation.y = Math.PI; a.g.add(c); a.parts.chi = c
      if (P) { const m = new P('female-d', { anim: 'walk' }); m.group.rotation.y = Math.PI; m.group.position.set(Math.sign(ev.tx) * 0.2, 0, -0.4); a.g.add(m.group); a.parts.madam = m
        const bag = mesh(RB(0.3, 0.32, 0.18, 0.04), M(0xf2efe8)), egg = mesh(RB(0.24, 0.08, 0.14, 0.03), M(0xe8d9b8)); egg.position.y = 0.2; bag.add(egg); bag.position.set(0.42, 0.55, 0); m.group.add(bag); a.parts.bag = bag }
    }
    if (k === 'yakiimo') {
      const t = new THREE.Group(); t.position.set(Math.sign(ev.tx) * -0.75, 0, -1.2); a.g.add(t); a.parts.truck = t
      mesh(RB(1.5, 1.4, 1.3, 0.12), M(0xf3f1ea, 0.5), 0, 1.0, -1.1, t)   // 運転席
      mesh(new THREE.BoxGeometry(1.3, 0.5, 0.06), M(0x2a3138, 0.2, { metalness: 0.3 }), 0, 1.3, -1.76, t).rotation.x = 0.1
      mesh(new THREE.BoxGeometry(1.5, 0.12, 2.2), M(0xe9e6de, 0.6), 0, 0.6, 0.6, t)   // 荷台
      for (const xx of [-0.65, 0.65]) for (const zz of [-1.1, 1.1]) mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 14), M(0x1c1c1c), xx, 0.27, zz, t).rotation.z = Math.PI / 2
      const oven = mesh(RB(1.1, 0.7, 1.0, 0.08), M(0x2b2b2b, 0.6, { metalness: 0.3 }), 0, 1.03, 0.6, t)
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), M(0x2b2b2b), 0.35, 1.8, 0.4, t)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3), textPlate(['石', '焼', 'き', '芋'], { w: 96, h: 300, size: 52, bg: '#c8322a', fg: '#fff3d0' })); flag.position.set(-0.6, 2.0, 1.4); flag.rotation.y = Math.PI / 2; t.add(flag)
      mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.4, 4), M(0x8a6a3a), -0.6, 1.5, 1.68, t)
      const lan = new THREE.Mesh(RB(0.34, 0.44, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0xff8a4a, emissive: 0xff5a1a, emissiveIntensity: 1.6 })); lan.position.set(0.55, 1.75, 1.5); t.add(lan)
      a.parts.smoke = []
      for (let i = 0; i < 4; i++) { const sm = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdedad2, transparent: true, opacity: 0.4, depthWrite: false })); sm.position.set(0.35, 2.4 + i * 0.4, 0.4); t.add(sm); a.parts.smoke.push(sm) }
      if (P) { const m = new P('male-b', { anim: 'idle' }); m.group.position.set(-0.9, 0, 0.9); m.group.rotation.y = -Math.PI / 2 * Math.sign(ev.tx); t.add(m.group); a.parts.imo = m }
      a.parts.oven = oven
    }
    if (k === 'jogger' && P) {
      const m = new P('male-f', { anim: 'sprint' }); m.group.rotation.y = Math.PI; a.g.add(m.group); a.parts.jog = m
      const sw = mesh(RB(0.22, 0.12, 0.22, 0.03), M(0xf3e2b0)); const fill = mesh(RB(0.23, 0.04, 0.23, 0.01), M(0x6aa84f)); sw.add(fill); sw.position.set(0.32, 0.9, 0.15); m.group.add(sw); a.parts.sandwich = sw
    }
    if (k === 'wedding') {
      const set = new THREE.Group(); a.g.add(set); a.parts.set = set
      set.rotation.y = -Math.sign(ev.tx) * Math.PI / 2
      if (P) {
        const bride = new P('female-c', { anim: 'idle', tint: 0xffffff }); bride.group.position.set(-0.45, 0, 0); set.add(bride.group); a.parts.bride = bride
        const dress = mesh(new THREE.ConeGeometry(0.55, 0.9, 16), M(0xfbfaf6, 0.7), 0, 0.45, 0); bride.group.add(dress)
        const veil = mesh(new THREE.ConeGeometry(0.3, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 1.25, -0.08); bride.group.add(veil)
        const groom = new P('male-d', { anim: 'idle', tint: 0x3a3a44 }); groom.group.position.set(0.45, 0, 0); set.add(groom.group); a.parts.groom = groom
        const ph = new P('male-b', { anim: 'idle' }); ph.group.position.set(0.2, 0, 3.0); ph.group.rotation.y = Math.PI; set.add(ph.group); a.parts.ph = ph
      }
      const tri = new THREE.Group(); tri.position.set(0.2, 0, 2.4); set.add(tri)
      for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4), M(0x222222), Math.cos(i * 2.1) * 0.18, 0.62, Math.sin(i * 2.1) * 0.18, tri); l.rotation.set(Math.sin(i * 2.1) * 0.25, 0, -Math.cos(i * 2.1) * 0.25) }
      mesh(RB(0.24, 0.18, 0.16, 0.03), M(0x1a1a1a, 0.4), 0, 1.32, 0, tri)
      const refl = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, side: THREE.DoubleSide })); refl.position.set(-1.2, 1.1, 0.8); refl.rotation.y = 0.6; set.add(refl)
      // 花のアーチ
      for (const xx of [-1.1, 1.1]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), M(0xf0f0f0), xx, 1.1, -0.6, set)
      for (let i = 0; i < 9; i++) { const u = i / 8 * Math.PI; mesh(new THREE.SphereGeometry(0.13, 8, 6), M([0xf5c0cc, 0xffffff, 0xe8a0b4][i % 3], 0.7), -Math.cos(u) * 1.1, 2.2 + Math.sin(u) * 0.5, -0.6, set) }
    }
    if (k === 'wallet') {
      const hedge = mesh(RB(1.4, 0.9, 1.0, 0.3), M(0x4c7a3a, 0.95), 0, 0.45, 0, a.g); a.parts.hedge = hedge
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), transparent: true, depthWrite: false, toneMapped: false, color: 0xfff1b0 })); glint.position.set(-Math.sign(ev.tx) * 0.5, 0.25, 0.3); glint.scale.setScalar(0.5); a.g.add(glint); a.parts.glint = glint
      if (P) { const m = new P('female-f', { anim: 'idle', tint: 0xe8e0d8 }); m.group.position.set(0, 0, -2.2); m.group.visible = false; a.g.add(m.group); a.parts.granny = m }
    }
    if (k === 'marathon') {
      a.parts.runners = []
      if (P) for (let i = 0; i < 5; i++) { const m = new P(['male-b', 'female-d', 'male-f', 'female-b', 'male-d'][i], { anim: 'sprint' }); m.group.position.set(R(-2.2, 2.2), 0, R(1, 6)); a.g.add(m.group); a.parts.runners.push(m)
        const bib = mesh(new THREE.PlaneGeometry(0.22, 0.16), M(0xffffff)); bib.position.set(0, 0.62, 0.17); m.group.add(bib) }
      // ゴールのアーチ
      const arch = new THREE.Group(); arch.position.set(-ev.tx, 0, -(ev.at + 21) + ev.ts); root.add(arch); a.parts.arch = arch
      arch.position.set(0, 0, -(ev.at + 21))
      for (const xx of [-3.2, 3.2]) mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), M(0x2f6fb5, 0.6), xx, 1.7, 0, arch)
      const top = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.8, 0.3), textPlate(['FINISH  ゴール'], { w: 512, h: 64, size: 40, bg: '#2f6fb5' })); top.position.y = 3.6; arch.add(top)
      const tape = mesh(new THREE.BoxGeometry(6.2, 0.06, 0.02), M(0xffffff, 0.5), 0, 1.1, 0, arch); a.parts.tape = tape
      arch.visible = false
    }
    actors[ev.id] = a
    return a
  }
  return { root, props, poles, actors, makeActor, home, gaps }
}

let _gl = null
function glintTex() {
  if (_gl) return _gl
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,240,180,.8)'); g.addColorStop(1, 'rgba(255,240,180,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 2); x.lineTo(32, 62); x.moveTo(2, 32); x.lineTo(62, 32); x.stroke()
  _gl = new THREE.CanvasTexture(c); return _gl
}
function vendingMat() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d')
  x.fillStyle = '#dfe8f0'; x.fillRect(0, 0, 128, 160)
  const cols = ['#c8322a', '#2f6fb5', '#f2c84b', '#3a8a4a', '#8a4a2a', '#e86a7a']
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { x.fillStyle = cols[(r * 2 + k) % 6]; x.fillRect(8 + k * 19, 14 + r * 46, 13, 30); x.fillStyle = '#fff'; x.fillRect(8 + k * 19, 46 + r * 46, 13, 4) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.3 })
}

// 動かない物を材質ごとに1つのメッシュにまとめる（描く回数を減らす。スマホ向け）
function mergeStatic(g) {
  g.updateMatrixWorld(true)
  const by = new Map(), drop = []
  g.traverse(o => {
    if (!o.isMesh) return
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld)
    if (geo.index) geo = geo.toNonIndexed()
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
    const key = o.material.uuid + ':' + Math.floor(-p.z / 30)   // 30m ごとに分けて、見えない所は描かない
    if (!by.has(key)) by.set(key, { mat: o.material, geos: [], shadow: o.castShadow })
    by.get(key).geos.push(geo); drop.push(o)
  })
  for (const o of drop) o.removeFromParent()
  for (const { mat, geos, shadow } of by.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow; m.receiveShadow = true; m.geometry.computeBoundingSphere()
    g.add(m); for (const q of geos) q.dispose()
  }
}
