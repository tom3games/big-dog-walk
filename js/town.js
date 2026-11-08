// 夕方の住宅街（v2: 3列のランナー）。道の両端は緑の路側帯（グリーンベルト）、真ん中がアスファルト
// sim の障害物・おやつ・犬が飛びつく相手を three.js に置く。座標: sim の (x, s) は three の (x, y, -s)
import * as THREE from 'three'
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js'
import { surfaceTex } from './look.js?v=2'
import { ROUTE, LX, mulberry32 } from './sim.js?v=2'
import { makeCat, makeChihuahua, makePigeon } from './critter.js?v=2'

const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))
const matCache = new Map()
const M = (c, r = 0.85, extra = {}) => { const k = c + ':' + r + JSON.stringify(extra); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, ...extra })); return matCache.get(k) }
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m }

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
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: !!o.transparent })
}

export function buildTown(scene, w, opt = {}) {
  const rng = mulberry32(w.seed * 97 + 5)
  const R = (a, b) => a + (b - a) * rng()
  const root = new THREE.Group(); scene.add(root)
  const stat = new THREE.Group(); root.add(stat)
  const LEN = ROUTE + 80, Z0 = 20
  scene.background = new THREE.Color(0xe9b98a)
  scene.fog = new THREE.Fog(0xe8b48c, 28, 72)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }))
  sky.renderOrder = -10; root.add(sky); scene.userData.sky = sky
  // ---- 道: 真ん中はアスファルト、両端は緑の路側帯。白線で3列が見分けられる
  const asph = surfaceTex({ w: 256, h: 256, base: '#5d5b5d', noise: 0.16, grime: 0.12, repeat: [1.2, LEN / 4.5], seed: 3,
    draw: (x, W, H, r) => { for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * W, r() * H, 2, 2) } } })
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, LEN), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.95 }))
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, Z0 - LEN / 2); road.receiveShadow = true; root.add(road)
  const greenTex = surfaceTex({ w: 128, h: 256, base: '#3f8a5a', noise: 0.18, grime: 0.2, repeat: [1, LEN / 5], seed: 7 })
  const greenM = new THREE.MeshStandardMaterial({ map: greenTex, roughness: 0.9 })
  const lineM = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.7 })
  for (const s of [-1, 1]) {
    const gb = new THREE.Mesh(new THREE.PlaneGeometry(1.25, LEN), greenM); gb.rotation.x = -Math.PI / 2; gb.position.set(s * LX, 0.003, Z0 - LEN / 2); gb.receiveShadow = true; root.add(gb)
    for (const dx of [-0.66, 0.66]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, LEN), lineM); l.rotation.x = -Math.PI / 2; l.position.set(s * LX + dx, 0.005, Z0 - LEN / 2); l.receiveShadow = true; root.add(l) }
    const gut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, LEN), M(0x9b9790, 0.9)); gut.position.set(s * 3.38, 0.03, Z0 - LEN / 2); gut.receiveShadow = true; root.add(gut)
  }
  // 路面の「止まれ」「通学路」
  const tomare = textPlate(['止まれ'], { bg: 'rgba(0,0,0,0)', fg: '#f2efe4', w: 256, h: 512, size: 150, transparent: true }); tomare.depthWrite = false
  const tsugaku = textPlate(['通学路'], { bg: 'rgba(0,0,0,0)', fg: '#f2efe4', w: 256, h: 512, size: 120, transparent: true }); tsugaku.depthWrite = false
  for (let s = 70; s < ROUTE; s += R(90, 140)) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6), rng() < 0.5 ? tomare : tsugaku); p.rotation.x = -Math.PI / 2; p.position.set(0, 0.006, -s); stat.add(p) }

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
  for (const side of [-1, 1]) {
    let s = -12
    while (s < ROUTE + 30) {
      const lot = R(8, 11), gate = R(1.4, 1.8), gs = s + R(1.5, lot - gate - 1.5)
      for (const [a, b] of [[s, gs], [gs + gate, s + lot]]) {
        const L = b - a; if (L < 0.2) continue
        const wm = new THREE.Mesh(wallGeo(L), wallM); wm.position.set(side * 3.68, 0.575, -(a + L / 2)); wm.castShadow = wm.receiveShadow = true; stat.add(wm)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, L), M(0x8e8a82, 0.9)); cap.position.set(side * 3.68, 1.18, -(a + L / 2)); cap.receiveShadow = true; stat.add(cap)
      }
      for (const k of [0, 1]) mesh(new THREE.BoxGeometry(0.3, 1.35, 0.3), M(0x8c8378, 0.9), side * 3.68, 0.675, -(gs + k * gate), stat)
      const hw = R(6, Math.min(8.5, lot - 0.6)), hd = R(5.5, 7), hh = R(4.8, 6.2), hx = side * (3.9 + 1.2 + hd / 2), hs = s + lot / 2
      const col = houseCols[Math.floor(rng() * houseCols.length)]
      mesh(new THREE.BoxGeometry(hd, hh, hw), M(col, 0.9), hx, hh / 2, -hs, stat)
      const rc = M(roofCols[Math.floor(rng() * roofCols.length)], 0.75)
      const rise = R(1.3, 2.0), half = hd / 2 + 0.4, slope = Math.hypot(half, rise)
      for (const k of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(slope, 0.16, hw + 0.6), rc, hx + k * half / 2, hh + rise / 2, -hs, stat); r.rotation.z = -k * Math.atan2(rise, half) }
      const gable = new THREE.Shape(); gable.moveTo(-hd / 2, 0); gable.lineTo(hd / 2, 0); gable.lineTo(0, rise); gable.closePath()
      for (const k of [-1, 1]) { const gm = mesh(new THREE.ShapeGeometry(gable), M(col, 0.9), hx, hh, -hs + k * hw / 2 * 1.001, stat); if (k < 0) gm.rotation.y = Math.PI }
      const fx = hx - side * (hd / 2 + 0.01)
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        if (rng() < 0.25) continue
        const wv = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), rng() < 0.55 ? winMat : winOff)
        wv.position.set(fx, 1.5 + j * 2.1, -(hs - hw / 2 + (i + 0.5) * hw / 3)); wv.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; stat.add(wv)
      }
      if (rng() < 0.55) {
        const tx = side * R(4.2, 4.7), ts = s + R(0.5, lot - 0.5)
        mesh(new THREE.CylinderGeometry(0.08, 0.12, 2, 6), M(0x6a4a33), tx, 1, -ts, stat)
        const lc = [0x4f7d3c, 0x5d8a44, 0x3f6b37][Math.floor(rng() * 3)]
        for (let k = 0; k < 3; k++) mesh(new THREE.IcosahedronGeometry(R(0.6, 0.9), 1), M(lc, 0.9), tx + R(-0.3, 0.3), 2.2 + R(0, 0.7), -ts + R(-0.4, 0.4), stat)
      }
      s += lot
    }
  }
  // 道ばたの電柱（飾り）と電線
  const polesBy = { '-1': [], 1: [] }
  for (const d of w.deco) {
    const x = d.side * 3.05
    mesh(new THREE.CylinderGeometry(0.15, 0.2, 8.5, 10), M(0xb3aea4, 0.85), x, 4.25, -d.s, stat)
    mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), M(0x6e6a62), x, 7.6, -d.s, stat)
    mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.9, 10, 1, true), M(0xe8c23a, 0.6), x, 1.0, -d.s, stat)
    polesBy[d.side].push(d)
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0.7 })
  for (const side of [-1, 1]) {
    const ps = polesBy[side]
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i], b = ps[i + 1]
      for (const dx of [-0.6, 0.6]) { const pts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push(new THREE.Vector3(side * 3.05 + dx, 7.55 - Math.sin(Math.PI * u) * 0.5, -(a.s + (b.s - a.s) * u))) } root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat)) }
    }
  }
  mergeStatic(stat)
  // ---- 家（ゴール）: 道の突き当たり
  const home = new THREE.Group(); home.position.set(0, 0, -(ROUTE + 7)); root.add(home)
  mesh(new THREE.BoxGeometry(9, 5.4, 5), M(0xf3e7cf), 0, 2.7, -1, home)
  for (const k of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(5.3, 0.18, 6), M(0x7a3f32, 0.7), k * 2.3, 6.2, -1, home); r.rotation.z = -k * 0.55 }
  mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), M(0x7a5032), 0, 1.1, 1.52, home)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xffe7b0, emissive: 0xffb84a, emissiveIntensity: 2 })); lamp.position.set(1, 2.5, 1.55); home.add(lamp)
  const np = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.56), nameMat); np.position.set(-1, 1.6, 1.56); home.add(np)
  for (const k of [-1, 1]) { const wv = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), winMat); wv.position.set(k * 3, 1.8, 1.52); home.add(wv); const w2 = wv.clone(); w2.position.y = 4; home.add(w2) }
  const homeLight = new THREE.PointLight(0xffb86a, 6, 9, 2); homeLight.position.set(0, 2.6, 2.5); home.add(homeLight)

  // ---- おやつ（ジャーキー）。全部を1つのインスタンスで描く
  const jerkyGeo = new THREE.CapsuleGeometry(0.07, 0.26, 3, 8); jerkyGeo.rotateZ(Math.PI / 2)
  const jerky = new THREE.InstancedMesh(jerkyGeo, new THREE.MeshStandardMaterial({ color: 0x9a4a22, roughness: 0.5, emissive: 0x5a1a00, emissiveIntensity: 0.35 }), Math.max(1, w.treats.length))
  jerky.castShadow = true; jerky.frustumCulled = false; root.add(jerky)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3()
  function updateTreats(meS, t) {
    for (const tr of w.treats) {
      const vis = !tr.got && tr.s > meS - 2 && tr.s < meS + 60
      _p.set(tr.x, tr.y + Math.sin(t * 4 + tr.id) * 0.05, -tr.s); _e.set(0.3, t * 3 + tr.id, 0); _q.setFromEuler(_e); _s.setScalar(vis ? 1 : 0)
      _m.compose(_p, _q, _s); jerky.setMatrixAt(tr.id, _m)
    }
    jerky.instanceMatrix.needsUpdate = true
  }

  // ---- 障害物（近づいたら作る・過ぎたら消す）
  const obs = new Map()
  const P = opt.Person
  const person = (file, o) => P ? new P(file, o) : null
  function makeOb(o) {
    const g = new THREE.Group(); g.position.set(o.x, 0, -o.s); root.add(g)
    const it = { o, g, parts: {}, t: 0 }
    const k = o.kind
    if (k === 'banana') {
      const peel = new THREE.Group(); g.add(peel)
      for (let i = 0; i < 4; i++) { const p = mesh(new THREE.CapsuleGeometry(0.06, 0.26, 3, 8), M(0xf2d03a, 0.6), 0, 0.06, 0, peel); p.rotation.set(Math.PI / 2 - 0.25, i * Math.PI / 2, 0); p.position.set(Math.sin(i * Math.PI / 2) * 0.14, 0.06, Math.cos(i * Math.PI / 2) * 0.14) }
      mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), M(0xe0c030, 0.6), 0, 0.08, 0, peel)
      mesh(new THREE.SphereGeometry(0.03, 6, 4), M(0x4a3a20), 0, 0.15, 0, peel)
      peel.scale.setScalar(2.4); peel.position.z = -0.25
    } else if (k === 'manhole') {
      mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20), M(0x0c0b0b, 1), 0, 0.006, -0.45, g)
      const lid = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 20), M(0x4a4846, 0.5, { metalness: 0.4 }), 0.55, 0.12, -0.45, g); lid.rotation.z = 0.6
      for (const dx of [-0.55, 0.55]) { const c = mesh(new THREE.ConeGeometry(0.2, 0.7, 12), M(0xf06a1a, 0.6), dx, 0.35, -0.05, g); mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.08, 12), M(0xffffff, 0.5), 0, 0.02, 0, c) }
      mesh(new THREE.BoxGeometry(1.1, 0.07, 0.05), M(0xf2c84b, 0.5), 0, 0.5, -0.05, g)
    } else if (k === 'cement') {
      const L = o.len
      mesh(new THREE.BoxGeometry(1.2, 0.04, L), M(0xb8b4ac, 0.95), 0, 0.02, -L / 2, g)
      for (const dx of [-0.62, 0.62]) mesh(new THREE.BoxGeometry(0.06, 0.12, L + 0.1), M(0xa8804a, 0.8), dx, 0.06, -L / 2, g)
      for (const dz of [0.05, -L - 0.05]) mesh(new THREE.BoxGeometry(1.3, 0.12, 0.06), M(0xa8804a, 0.8), 0, 0.06, dz, g)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), textPlate(['生コン', '注意'], { w: 128, h: 72, size: 26, bg: '#f2c84b', fg: '#1d1410' })); sign.position.set(0.45, 0.32, 0.12); g.add(sign)
      mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), M(0x6a4a2a), 0.45, 0.15, 0.1, g)
      for (let i = 0; i < 2; i++) mesh(new THREE.BoxGeometry(0.1, 0.01, 0.2), M(0x8a8680, 0.95), -0.2 + i * 0.3, 0.045, -0.4 - i * 0.6, g)
    } else if (k === 'puddle') {
      const pm = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshStandardMaterial({ color: 0x5e7894, roughness: 0.08, metalness: 0.6 }))
      pm.rotation.x = -Math.PI / 2; pm.scale.set(1, o.len / 1.24, 1); pm.position.set(0, 0.008, -o.len / 2); g.add(pm)
      it.parts.ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xcfe0ee, transparent: true, opacity: 0.6, depthWrite: false })); it.parts.ring.rotation.x = -Math.PI / 2; it.parts.ring.position.set(0.1, 0.012, -o.len / 2); g.add(it.parts.ring)
    } else if (k === 'cat') {
      const c = makeCat({ fur: rng() < 0.5 ? 0xe0a060 : 0x3a3a3c }); c.sleep(1); c.group.rotation.y = R(-0.8, 0.8); c.group.scale.setScalar(1.7); c.group.position.z = -0.3; g.add(c.group); it.parts.cat = c
      const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zzzTex(), transparent: true, depthWrite: false })); z.position.set(0.15, 0.55, -0.3); z.scale.setScalar(0.35); g.add(z); it.parts.z = z
    } else if (k === 'skate') {
      const b = new THREE.Group(); g.add(b); it.parts.board = b
      mesh(RB(0.26, 0.04, 0.82, 0.02), M(0x2b8f7a, 0.6), 0, 0.1, 0, b)
      for (const zz of [-0.28, 0.28]) for (const xx of [-0.1, 0.1]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), M(0xf2e14b, 0.5), xx, 0.04, zz, b).rotation.z = Math.PI / 2
      b.scale.setScalar(1.7); b.position.z = -0.4
    } else if (k === 'bar') {
      // 物干し竿。竿は列の中央、洗濯物がぶら下がる。端の列なら塀の側に支柱
      const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), M(0x7fb3d8, 0.4), 0, 1.25, 0, g); pole.rotation.z = Math.PI / 2
      const cols = [0xffffff, 0x4f8fd6, 0xe86a7a, 0xf2c84b, 0x9ccc65]
      for (let i = 0; i < 3; i++) { const c = mesh(RB(0.36, 0.42, 0.03, 0.02), M(cols[(i + o.id) % 5], 0.9), -0.5 + i * 0.5, 1.0, 0, g); c.rotation.z = R(-0.1, 0.1) }
      if (o.lane !== 0) mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), M(0xd8dadc, 0.4, { metalness: 0.4 }), o.lane * 0.82, 0.65, 0, g)
    } else if (k === 'crow') {
      const c = makePigeon(); c.scale.setScalar(2.8); c.traverse(m => { if (m.isMesh) m.material = M(0x16161a, 0.5) }); c.position.y = 1.0; c.rotation.y = o.dir > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(c); it.parts.crow = c
    } else if (k === 'sprinkler') {
      mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 12), M(0x2f7a3a, 0.6), 0, 0.06, -0.6, g)
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), M(0x2f7a3a, 0.5), 0, 0.2, -0.6, g)
      it.parts.drops = []
      const dm = new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.85, depthWrite: false })
      for (let i = 0; i < 26; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), dm); g.add(d); it.parts.drops.push(d) }
      const len = Math.abs(o.x) + 2.2, hose = mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), M(0x3fa84a, 0.6), (o.x >= 0 ? 1 : -1) * len / 2, 0.025, -0.6, g); hose.rotation.z = Math.PI / 2
    } else if (k === 'bike') {
      const bk = new THREE.Group(); g.add(bk)
      for (const zz of [-0.5, 0.5]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 18), M(0x1e1e1e)); wh.position.set(0, 0.34, zz); wh.rotation.y = Math.PI / 2; wh.castShadow = true; bk.add(wh) }
      mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), M(0x2f6fb5, 0.5), 0, 0.58, 0, bk)
      mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), M(0x2f6fb5, 0.5), 0, 0.55, -0.18, bk)
      mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), M(0x2a2a2a), 0, 0.92, 0.42, bk)
      mesh(new THREE.BoxGeometry(0.36, 0.24, 0.28), M(0x9aa0a6, 0.4, { metalness: 0.4 }), 0, 0.86, 0.6, bk)
      const rider = person('male-b', { anim: 'sit' })
      if (rider) { rider.group.position.set(0, 0.25, -0.1); bk.add(rider.group); it.parts.rider = rider }
      bk.position.z = -0.85; it.parts.bk = bk
    } else if (k === 'pot') {
      const sd = o.x >= 0 ? 1 : -1, bal = new THREE.Group(); bal.position.set(sd * 3.5 - o.x, 0, -0.35); g.add(bal)
      mesh(new THREE.BoxGeometry(1.4, 0.12, 1.6), M(0xd8d2c8, 0.9), 0, 3.4, 0, bal)
      mesh(new THREE.BoxGeometry(0.06, 0.6, 1.6), M(0x6e6a62, 0.5), -sd * 0.7, 3.75, 0, bal)
      const pot = new THREE.Group(); pot.position.z = -0.35; g.add(pot); it.parts.pot = pot
      mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.34, 12), M(0xb5653a, 0.8), 0, 0.17, 0, pot)
      mesh(new THREE.IcosahedronGeometry(0.24, 1), M(0x4f8a3c), 0, 0.44, 0, pot)
      for (let j = 0; j < 4; j++) mesh(new THREE.SphereGeometry(0.06, 6, 5), M([0xe0405a, 0xf2c84b, 0xf5f2ec, 0xb85cc8][j], 0.6), R(-0.14, 0.14), 0.6, R(-0.14, 0.14), pot)
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.012, -0.35); g.add(sh); it.parts.sh = sh
    } else if (k === 'truck') {
      const L = o.len, t = new THREE.Group(); g.add(t)
      mesh(RB(1.6, 1.5, 1.4, 0.12), M(0xf3f1ea, 0.5), 0, 1.05, -0.7, t)
      mesh(new THREE.BoxGeometry(1.4, 0.5, 0.06), M(0x2a3138, 0.2, { metalness: 0.3 }), 0, 1.4, -0.02, t)
      mesh(RB(1.7, 1.9, L - 1.4, 0.1), M(0x2f6fb5, 0.6), 0, 1.25, -1.4 - (L - 1.4) / 2, t)
      mesh(new THREE.BoxGeometry(1.72, 0.18, L - 1.4), M(0xf3f1ea, 0.5), 0, 0.75, -1.4 - (L - 1.4) / 2, t)
      for (const zz of [-0.8, -L + 1.2]) for (const xx of [-0.75, 0.75]) mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), M(0x1c1c1c), xx, 0.34, zz, t).rotation.z = Math.PI / 2
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), textPlate(['清掃車'], { w: 256, h: 72, size: 44, bg: '#2f6fb5', fg: '#fff' })); lbl.position.set(0, 1.62, 0.01); g.add(lbl)
      it.parts.light = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0xff7a00, emissiveIntensity: 1.5 }), 0, 1.85, -0.7, t)
      for (let i = 0; i < 3; i++) mesh(new THREE.IcosahedronGeometry(0.22, 0), M(0xeeeeee, 0.8), R(-0.5, 0.5), 0.2, -L - 0.2 - i * 0.3, g)
    } else if (k === 'gate') {
      // 塀の門扉が道へ開く。蝶番は塀の側
      const hinge = new THREE.Group(); hinge.position.set(o.side * 3.55 - o.x, 0, -0.65); g.add(hinge); it.parts.hinge = hinge
      const door = new THREE.Group(); hinge.add(door); door.position.x = -o.side * 0.8
      for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), M(0x3a4a3a, 0.5, { metalness: 0.4 }), -0.7 + i * 0.28, 0.65, 0, door)
      for (const y of [0.15, 1.15]) mesh(new THREE.BoxGeometry(1.6, 0.06, 0.05), M(0x3a4a3a, 0.5, { metalness: 0.4 }), 0, y, 0, door)
      it.parts.door = door
    } else if (k === 'cart') {
      const c = new THREE.Group(); c.position.z = -0.5; g.add(c); it.parts.c = c
      mesh(new THREE.BoxGeometry(0.6, 0.06, 0.9), M(0x2f6fb5, 0.5), 0, 0.14, 0, c)
      for (const xx of [-0.25, 0.25]) for (const zz of [-0.35, 0.35]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), M(0x222222), xx, 0.06, zz, c).rotation.z = Math.PI / 2
      mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), M(0x9aa0a6, 0.4, { metalness: 0.5 }), 0, 0.6, -0.45, c)
      const box = M(0xc59a62, 0.9)
      mesh(new THREE.BoxGeometry(0.56, 0.4, 0.5), box, 0, 0.37, 0.05, c); mesh(new THREE.BoxGeometry(0.46, 0.34, 0.42), box, 0.02, 0.74, 0.08, c); mesh(new THREE.BoxGeometry(0.36, 0.26, 0.3), box, -0.03, 1.04, 0.06, c)
      const pp = person('male-f', { anim: 'walk' })
      if (pp) { pp.group.position.set(0, 0, -0.75); c.add(pp.group); it.parts.pp = pp }
      c.rotation.y = o.dir > 0 ? Math.PI / 2 : -Math.PI / 2
    } else if (k === 'sign') {
      const s = new THREE.Group(); s.position.z = -0.25; g.add(s)
      for (const dz of [-0.14, 0.14]) { const b = mesh(new THREE.BoxGeometry(0.62, 1.0, 0.03), M(0xf2c84b, 0.6), 0, 0.5, dz, s); b.rotation.x = dz > 0 ? -0.14 : 0.14 }
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.62), textPlate(['工事中', 'ご迷惑を', 'おかけします'], { w: 160, h: 180, size: 30, bg: '#f7f5ef', fg: '#1d1410', border: '#d4302a' })); face.position.set(0, 0.58, 0.19); face.rotation.x = -0.14; s.add(face)
      s.scale.setScalar(1.3)
    } else if (k === 'walker') {
      const files = ['female-d', 'male-d', 'female-c', 'male-b']
      const pp = person(files[o.id % files.length], { anim: o.vs0 === 0 ? 'idle' : 'walk' })
      if (pp) { pp.group.position.z = -0.3; g.add(pp.group); it.parts.pp = pp
        if (o.id % 2) { const ph = mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), M(0x222222, 0.3), 0.12, 0.98, 0.18); pp.group.add(ph) } }
    } else if (k === 'pole') {
      mesh(new THREE.CylinderGeometry(0.17, 0.22, 8.5, 12), M(0xb3aea4, 0.85), 0, 4.25, -0.2, g)
      mesh(new THREE.CylinderGeometry(0.225, 0.225, 1.2, 12, 1, true), M(0xe8c23a, 0.6), 0, 1.0, -0.2, g)
      for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.228, 0.228, 0.12, 12, 1, true), M(0x1d1410, 0.6), 0, 0.5 + i * 0.3, -0.2, g)
      mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), M(0x6e6a62), 0, 7.6, -0.2, g)
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), textPlate(['ムギ町', String(1 + Math.floor(o.s / 200)) + '丁目'], { w: 96, h: 300, size: 30, bg: '#1d4f9c' })); plate.position.set(0, 2.2, 0.03); g.add(plate)
    } else if (k === 'wedding') {
      // 前撮り: 手前にカメラマン、奥に新郎新婦と花のアーチ（列の長さ 3m）
      const set = new THREE.Group(); g.add(set)
      const bride = person('female-c', { anim: 'idle', tint: 0xffffff }), groom = person('male-d', { anim: 'idle', tint: 0x3a3a44 }), ph = person('male-b', { anim: 'crouch' })
      if (bride) { bride.group.position.set(-0.3, 0, -2.5); set.add(bride.group); mesh(new THREE.ConeGeometry(0.55, 0.9, 16), M(0xfbfaf6, 0.7), 0, 0.45, 0, bride.group); const veil = mesh(new THREE.ConeGeometry(0.3, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 1.25, -0.08); bride.group.add(veil); it.parts.bride = bride }
      if (groom) { groom.group.position.set(0.32, 0, -2.5); set.add(groom.group); it.parts.groom = groom }
      if (ph) { ph.group.position.set(0, 0, -0.1); ph.group.rotation.y = Math.PI; set.add(ph.group); it.parts.ph = ph }
      const tri = new THREE.Group(); tri.position.set(0.1, 0, -0.5); set.add(tri)
      for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 4), M(0x222222), Math.cos(i * 2.1) * 0.18, 0.62, Math.sin(i * 2.1) * 0.18, tri); l.rotation.set(Math.sin(i * 2.1) * 0.25, 0, -Math.cos(i * 2.1) * 0.25) }
      mesh(RB(0.24, 0.18, 0.16, 0.03), M(0x1a1a1a, 0.4), 0, 1.32, 0, tri)
      const refl = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, side: THREE.DoubleSide })); refl.position.set(-0.55, 1.0, -1.5); refl.rotation.y = 0.9; set.add(refl)
      for (const xx of [-0.75, 0.75]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), M(0xf0f0f0), xx, 1.05, -2.95, set)
      for (let i = 0; i < 9; i++) { const u = i / 8 * Math.PI; mesh(new THREE.SphereGeometry(0.12, 8, 6), M([0xf5c0cc, 0xffffff, 0xe8a0b4][i % 3], 0.7), -Math.cos(u) * 0.75, 2.1 + Math.sin(u) * 0.4, -2.95, set) }
    } else if (k === 'runner') {
      const files = ['male-b', 'female-d', 'male-f', 'female-c', 'male-d']
      const pp = person(files[o.id % files.length], { anim: 'sprint' })
      if (pp) { pp.group.position.z = -0.3; pp.group.rotation.y = Math.PI; g.add(pp.group); it.parts.pp = pp; const bib = mesh(new THREE.PlaneGeometry(0.22, 0.16), M(0xffffff), 0, 0.62, -0.17); bib.rotation.y = Math.PI; pp.group.add(bib) }
    }
    obs.set(o.id, it)
    return it
  }
  function dropOb(id) {
    const it = obs.get(id); if (!it) return; root.remove(it.g); obs.delete(id)
    // 人（骨入り）は元の形を共有しているので捨てない。ほかは GPU から外す
    it.g.traverse(m => { if (m.isMesh && !m.isSkinnedMesh && !m.parent?.isBone) { m.geometry.dispose(); if (m.material && m.material.map && ![...matCache.values()].includes(m.material)) m.material.map.dispose() } })
  }

  // ---- 犬が飛びつく相手（道ばた）
  const actors = new Map()
  function makeActor(dz) {
    const a = { dz, g: new THREE.Group(), parts: {}, t: 0 }
    a.g.position.set(dz.tx, 0, -dz.ts); root.add(a.g)
    const side = dz.side
    if (dz.target === 'cat') { const c = makeCat(); c.group.position.set(side * 0.38, 1.21, 0); c.group.rotation.y = -side * Math.PI / 2; c.group.scale.setScalar(1.2); a.g.add(c.group); a.parts.cat = c }
    if (dz.target === 'pigeon') { a.parts.birds = []; for (let i = 0; i < 6; i++) { const b = makePigeon(); b.scale.setScalar(1.9); b.position.set(R(-0.3, 0.2) * side, 0, R(-1.4, 1.4)); b.rotation.y = R(0, 6.28); a.g.add(b); a.parts.birds.push(b) } }
    if (dz.target === 'smalldog') {
      const c = makeChihuahua(); c.group.position.set(0, 0, 0.3); c.group.rotation.y = Math.PI; c.group.scale.setScalar(1.3); a.g.add(c.group); a.parts.chi = c
      const m = person('female-d', { anim: 'idle' }); if (m) { m.group.rotation.y = -side * Math.PI / 2; m.group.position.set(side * 0.35, 0, -0.5); a.g.add(m.group); a.parts.madam = m }
    }
    if (dz.target === 'yakiimo') {
      const t = new THREE.Group(); t.position.set(side * 0.9, 0, 0); a.g.add(t); a.parts.truck = t
      mesh(RB(1.5, 1.4, 1.3, 0.12), M(0xf3f1ea, 0.5), 0, 1.0, -1.1, t)
      mesh(new THREE.BoxGeometry(1.5, 0.12, 2.2), M(0xe9e6de, 0.6), 0, 0.6, 0.6, t)
      for (const xx of [-0.65, 0.65]) for (const zz of [-1.1, 1.1]) mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 14), M(0x1c1c1c), xx, 0.27, zz, t).rotation.z = Math.PI / 2
      mesh(RB(1.1, 0.7, 1.0, 0.08), M(0x2b2b2b, 0.6, { metalness: 0.3 }), 0, 1.03, 0.6, t)
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), M(0x2b2b2b), 0.35, 1.8, 0.4, t)
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.3), textPlate(['石', '焼', 'き', '芋'], { w: 96, h: 300, size: 52, bg: '#c8322a', fg: '#fff3d0' })); flag.position.set(-side * 0.76, 2.0, 1.2); flag.rotation.y = -side * Math.PI / 2; t.add(flag)
      const lan = new THREE.Mesh(RB(0.34, 0.44, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0xff8a4a, emissive: 0xff5a1a, emissiveIntensity: 1.6 })); lan.position.set(0.55, 1.75, 1.5); t.add(lan)
      a.parts.smoke = []
      for (let i = 0; i < 4; i++) { const sm = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdedad2, transparent: true, opacity: 0.4, depthWrite: false })); sm.position.set(0.35, 2.4 + i * 0.4, 0.4); t.add(sm); a.parts.smoke.push(sm) }
    }
    actors.set(dz.id, a)
    return a
  }
  // 財布・マラソンのスタートとゴール
  const extras = []
  for (const ex of w.extras) {
    if (ex.kind === 'wallet') {
      const g = new THREE.Group(); g.position.set(ex.x, 0, -ex.s); root.add(g)
      mesh(new THREE.BoxGeometry(0.26, 0.05, 0.18), M(0x6a3a1c, 0.6), 0, 0.03, 0, g)
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), transparent: true, depthWrite: false, toneMapped: false, color: 0xfff1b0 })); glint.position.set(0, 0.3, 0); glint.scale.setScalar(0.6); g.add(glint)
      extras.push({ ex, g, glint })
    } else if (ex.kind === 'marathon') {
      const arch = new THREE.Group(); arch.position.set(0, 0, -ex.s1); root.add(arch)
      for (const xx of [-2.9, 2.9]) mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), M(0x2f6fb5, 0.6), xx, 1.7, 0, arch)
      const top = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.8, 0.3), textPlate(['FINISH  ゴール'], { w: 512, h: 64, size: 40, bg: '#2f6fb5' })); top.position.y = 3.6; arch.add(top)
      const tape = mesh(new THREE.BoxGeometry(5.6, 0.06, 0.02), M(0xffffff, 0.5), 0, 1.1, 0, arch)
      const start = new THREE.Group(); start.position.set(0, 0, -ex.s0); root.add(start)
      const banner = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.7, 0.2), textPlate(['ムギ町 市民マラソン'], { w: 512, h: 64, size: 36, bg: '#c8322a' })); banner.position.y = 3.4; start.add(banner)
      for (const xx of [-2.9, 2.9]) mesh(new THREE.BoxGeometry(0.2, 3.3, 0.2), M(0xc8322a, 0.6), xx, 1.65, 0, start)
      extras.push({ ex, g: arch, tape })
    }
  }
  return { root, obs, makeOb, dropOb, actors, makeActor, home, extras, updateTreats, jerky }
}

let _gl = null, _zz = null
function glintTex() {
  if (_gl) return _gl
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,240,180,.8)'); g.addColorStop(1, 'rgba(255,240,180,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 2); x.lineTo(32, 62); x.moveTo(2, 32); x.lineTo(62, 32); x.stroke()
  _gl = new THREE.CanvasTexture(c); return _gl
}
function zzzTex() {
  if (_zz) return _zz
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')
  x.fillStyle = '#fff'; x.strokeStyle = '#1d1410'; x.lineWidth = 5
  for (const [t, xx, yy, s] of [['z', 8, 56, 20], ['z', 26, 38, 24], ['Z', 40, 22, 28]]) { x.font = `bold ${s}px sans-serif`; x.strokeText(t, xx, yy); x.fillText(t, xx, yy) }
  _zz = new THREE.CanvasTexture(c); _zz.colorSpace = THREE.SRGBColorSpace; return _zz
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
    const key = o.material.uuid + ':' + Math.floor(-p.z / 30)
    if (!by.has(key)) by.set(key, { mat: o.material, geos: [], shadow: o.castShadow })
    by.get(key).geos.push(geo); drop.push(o)
  })
  for (const o of drop) o.removeFromParent()
  for (const { mat, geos, shadow } of by.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow; m.receiveShadow = true; m.geometry.computeBoundingSphere()
    g.add(m); for (const q of geos) q.dispose()
  }
}
