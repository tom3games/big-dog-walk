// 大型犬（ゴールデン）とチワワ・猫・鳩の見た目。Kenney Mini と並べて浮かないよう、角を丸めた箱で組む
// 顔は canvas に描いて前面に貼る（ふつう・驚き・うれしい・踏ん張られ）
import * as THREE from 'three'
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js'

const RB = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.85, metalness: 0, ...o.extra })

// ---------------------------------------------------------------- 顔（canvas）
function dogFaceTex(expr, fur) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d')
  x.clearRect(0, 0, 256, 256)
  x.lineCap = 'round'; x.lineJoin = 'round'
  const ink = '#1d1410'
  const eyes = [[78, 110], [178, 110]]
  if (expr === 'happy') {
    x.strokeStyle = ink; x.lineWidth = 13
    for (const [cx, cy] of eyes) { x.beginPath(); x.moveTo(cx - 24, cy + 8); x.quadraticCurveTo(cx, cy - 24, cx + 24, cy + 8); x.stroke() }
    // ほっぺ
    for (const [cx] of eyes) { const g = x.createRadialGradient(cx, 160, 2, cx, 160, 34); g.addColorStop(0, 'rgba(255,110,110,.55)'); g.addColorStop(1, 'rgba(255,110,110,0)'); x.fillStyle = g; x.fillRect(cx - 40, 120, 80, 80) }
  } else if (expr === 'strain') {
    x.strokeStyle = ink; x.lineWidth = 12
    for (const [i, [cx, cy]] of eyes.entries()) { const s = i ? -1 : 1; x.beginPath(); x.moveTo(cx - s * 22, cy - 16); x.lineTo(cx + s * 14, cy); x.lineTo(cx - s * 22, cy + 16); x.stroke() }
  } else if (expr === 'sad') {
    for (const [cx, cy] of eyes) { x.fillStyle = ink; x.beginPath(); x.ellipse(cx, cy + 4, 17, 21, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 6, cy - 4, 6, 0, 7); x.fill(); x.fillStyle = 'rgba(140,200,255,.9)'; x.beginPath(); x.ellipse(cx - 4, cy + 30, 6, 10, 0, 0, 7); x.fill() }
    x.strokeStyle = ink; x.lineWidth = 8; x.beginPath(); x.moveTo(52, 70); x.lineTo(96, 84); x.moveTo(204, 70); x.lineTo(160, 84); x.stroke()
  } else {
    const big = expr === 'alert'
    for (const [cx, cy] of eyes) {
      if (big) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, cy, 30, 34, 0, 0, 7); x.fill(); x.strokeStyle = ink; x.lineWidth = 6; x.stroke() }
      x.fillStyle = ink; x.beginPath(); x.ellipse(cx, cy + 2, big ? 13 : 17, big ? 15 : 21, 0, 0, 7); x.fill()
      x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 6, cy - 6, big ? 5 : 7, 0, 7); x.fill()
    }
    if (big) { x.strokeStyle = ink; x.lineWidth = 8; x.beginPath(); x.moveTo(50, 58); x.lineTo(98, 50); x.moveTo(206, 58); x.lineTo(158, 50); x.stroke() }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t
}

export class BigDog {
  constructor() {
    const fur = 0xd99a45, light = 0xf1cf8f, dark = 0x9a6125
    this.mFur = M(fur); this.mLight = M(light); this.mDark = M(dark)
    const g = this.group = new THREE.Group()
    this.body = new THREE.Group(); g.add(this.body)
    this.body.position.y = 0.62
    const torso = new THREE.Mesh(RB(0.56, 0.5, 1.12, 0.16), this.mFur); this.body.add(torso)
    const chest = new THREE.Mesh(RB(0.46, 0.42, 0.3, 0.12), this.mLight); chest.position.set(0, -0.05, 0.5); this.body.add(chest)
    const belly = new THREE.Mesh(RB(0.42, 0.12, 0.8, 0.05), this.mLight); belly.position.set(0, -0.22, 0.02); this.body.add(belly)
    // 首輪（赤）
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), M(0xc8322a)); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.18, 0.56); this.body.add(collar)
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), M(0xf2c84b, { r: 0.35, extra: { metalness: 0.6 } })); tag.rotation.x = Math.PI / 2; tag.position.set(0, 0.03, 0.74); this.body.add(tag)
    this.collar = collar
    // 頭
    this.neck = new THREE.Group(); this.neck.position.set(0, 0.22, 0.56); this.body.add(this.neck)
    this.head = new THREE.Group(); this.head.position.set(0, 0.2, 0.12); this.neck.add(this.head)
    const skull = new THREE.Mesh(RB(0.5, 0.46, 0.46, 0.14), this.mFur); this.head.add(skull)
    const snout = new THREE.Mesh(RB(0.3, 0.22, 0.26, 0.08), this.mLight); snout.position.set(0, -0.1, 0.3); this.head.add(snout)
    const nose = new THREE.Mesh(RB(0.12, 0.08, 0.06, 0.03), M(0x1a1210, { r: 0.4 })); nose.position.set(0, -0.03, 0.44); this.head.add(nose)
    this.tongue = new THREE.Mesh(RB(0.1, 0.03, 0.16, 0.014), M(0xe86a7a)); this.tongue.position.set(0.03, -0.22, 0.38); this.tongue.rotation.x = 0.7; this.head.add(this.tongue)
    // 顔の板
    this.faces = { normal: dogFaceTex('normal'), alert: dogFaceTex('alert'), happy: dogFaceTex('happy'), strain: dogFaceTex('strain'), sad: dogFaceTex('sad') }
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.faces.normal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), this.faceMat); face.position.set(0, 0.04, 0.232); this.head.add(face)
    this.expr = 'normal'
    // 耳（付け根で回す。垂れ耳が立つ）
    this.ears = []
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.24, 0.16, -0.02); this.head.add(pivot)
      const ear = new THREE.Mesh(RB(0.08, 0.3, 0.2, 0.04), this.mDark); ear.position.set(s * 0.03, -0.14, 0); pivot.add(ear)
      pivot.userData.s = s; this.ears.push(pivot)
    }
    // しっぽ
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.16, -0.56); this.body.add(this.tail)
    const t1 = new THREE.Mesh(RB(0.12, 0.12, 0.42, 0.05), this.mFur); t1.position.z = -0.2; t1.rotation.x = 0; this.tail.add(t1)
    const t2 = new THREE.Mesh(RB(0.14, 0.14, 0.2, 0.06), this.mLight); t2.position.z = -0.42; this.tail.add(t2)
    // 脚（付け根で回す）
    this.legs = []
    for (const [x, z] of [[-0.17, 0.4], [0.17, 0.4], [-0.17, -0.4], [0.17, -0.4]]) {
      const hip = new THREE.Group(); hip.position.set(x, -0.12, z); this.body.add(hip)
      const leg = new THREE.Mesh(RB(0.15, 0.48, 0.17, 0.06), this.mFur); leg.position.y = -0.22; hip.add(leg)
      const paw = new THREE.Mesh(RB(0.17, 0.08, 0.22, 0.04), this.mLight); paw.position.set(0, -0.46, 0.03); hip.add(paw)
      this.legs.push(hip)
    }
    // 洗濯物のシャツ（たまに着て出てくる）
    const shirt = new THREE.Mesh(RB(0.62, 0.42, 0.62, 0.1), M(0x4f8fd6)); shirt.position.set(0, 0.05, 0.12); shirt.visible = false; this.body.add(shirt); this.shirt = shirt
    const stripe = new THREE.Mesh(RB(0.63, 0.08, 0.63, 0.03), M(0xffffff)); stripe.position.y = 0.05; shirt.add(stripe)
    // 財布をくわえる
    const wallet = new THREE.Mesh(RB(0.22, 0.05, 0.14, 0.02), M(0x6a3a1c)); wallet.position.set(0, -0.2, 0.44); wallet.visible = false; this.head.add(wallet); this.wallet = wallet
    this.group.traverse(o => { if (o.isMesh && o !== face) o.castShadow = true })
    this.phase = 0; this.wag = 0
  }
  setExpr(e) { if (e === this.expr || !this.faces[e]) return; this.expr = e; this.faceMat.map = this.faces[e]; this.faceMat.needsUpdate = true }
  // st: 歩く・走る・座る など。speed m/s、ears 0..1、look 体に対する首の向き（rad）
  pose(dt, o) {
    const sp = o.speed || 0
    this.phase += dt * (2.2 + sp * 2.2)
    const amp = Math.min(0.75, 0.15 + sp * 0.12) * (o.sit > 0.5 ? 0 : 1)
    const run = sp > 3.5
    this.legs.forEach((h, i) => {
      const front = i < 2, side = i % 2
      const ph = run ? this.phase + (front ? 0 : Math.PI) + side * 0.4 : this.phase + (side ^ (front ? 0 : 1)) * Math.PI
      h.rotation.x = Math.sin(ph) * amp
    })
    // 座る: 体を起こして後ろ脚をたたむ
    const sit = o.sit || 0
    this.body.rotation.x = -sit * 0.55 + (run ? Math.sin(this.phase * 2) * 0.06 : 0) + (o.strain ? -0.18 : 0)
    this.body.position.y = 0.62 - sit * 0.12 + (run ? Math.abs(Math.sin(this.phase)) * 0.08 : Math.abs(Math.sin(this.phase)) * 0.015 * (sp > 0.2 ? 1 : 0))
    this.legs[2].rotation.x += sit * 1.2; this.legs[3].rotation.x += sit * 1.2
    this.legs[0].rotation.x -= sit * 0.5; this.legs[1].rotation.x -= sit * 0.5
    // 耳: 0=垂れ、1=立つ
    const e = o.ears || 0
    for (const p of this.ears) { const s = p.userData.s; p.rotation.z = s * (0.15 - e * 0.15) + Math.sin(this.phase * 0.5) * 0.05 * (1 - e); p.rotation.x = -e * 2.6; p.position.y = 0.16 + e * 0.06 }
    this.neck.rotation.y = THREE.MathUtils.clamp(o.look || 0, -0.9, 0.9)
    this.neck.rotation.x = -e * 0.25 + (o.sniff ? 0.5 : 0)
    // しっぽ
    this.wag += dt * (o.happy ? 22 : run ? 14 : 6)
    this.tail.rotation.y = Math.sin(this.wag) * (o.happy ? 0.8 : 0.35)
    this.tail.rotation.x = -0.5 - e * 0.4
    this.tongue.visible = run || o.happy > 0.3 || sp > 1.5
    this.shirt.visible = !!o.shirt
  }
}

// チワワ（小さい・ぷるぷる）
export function makeChihuahua() {
  const g = new THREE.Group(), fur = M(0xe8c39a), dark = M(0x5a3a26)
  const b = new THREE.Mesh(RB(0.16, 0.14, 0.28, 0.05), fur); b.position.y = 0.2; g.add(b)
  const h = new THREE.Mesh(RB(0.18, 0.16, 0.16, 0.06), fur); h.position.set(0, 0.32, 0.16); g.add(h)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(RB(0.06, 0.14, 0.03, 0.01), fur); e.position.set(s * 0.08, 0.44, 0.15); e.rotation.z = -s * 0.4; g.add(e) }
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark); e.position.set(s * 0.045, 0.34, 0.245); g.add(e) }
  for (const [x, z] of [[-0.05, 0.08], [0.05, 0.08], [-0.05, -0.08], [0.05, -0.08]]) { const l = new THREE.Mesh(RB(0.04, 0.14, 0.04, 0.015), fur); l.position.set(x, 0.07, z); g.add(l) }
  const sw = new THREE.Mesh(RB(0.18, 0.1, 0.22, 0.04), M(0xd84b8a)); sw.position.y = 0.21; g.add(sw)   // セーター
  g.traverse(o => { if (o.isMesh) o.castShadow = true })
  return g
}
// 塀の上の猫
export function makeCat() {
  const g = new THREE.Group(), fur = M(0x3a3a3c), w = M(0xf2efe8)
  const b = new THREE.Mesh(RB(0.2, 0.2, 0.36, 0.07), fur); b.position.y = 0.16; g.add(b)
  const h = new THREE.Mesh(RB(0.22, 0.19, 0.18, 0.07), fur); h.position.set(0, 0.3, 0.18); g.add(h)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fur); e.position.set(s * 0.07, 0.43, 0.17); g.add(e) }
  const m = new THREE.Mesh(RB(0.1, 0.06, 0.04, 0.02), w); m.position.set(0, 0.26, 0.27); g.add(m)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), M(0xf5d33a, { r: 0.3 })); e.position.set(s * 0.055, 0.32, 0.27); g.add(e) }
  const t = new THREE.Mesh(RB(0.05, 0.05, 0.34, 0.02), fur); t.position.set(0, 0.3, -0.26); t.rotation.x = -0.9; g.add(t)
  for (const [x, z] of [[-0.06, 0.1], [0.06, 0.1], [-0.06, -0.1], [0.06, -0.1]]) { const l = new THREE.Mesh(RB(0.05, 0.1, 0.05, 0.02), w); l.position.set(x, 0.05, z); g.add(l) }
  g.traverse(o => { if (o.isMesh) o.castShadow = true })
  return g
}
export function makePigeon() {
  const g = new THREE.Group(), body = M(0x8d93a0), neck = M(0x5f7d6e)
  const b = new THREE.Mesh(RB(0.14, 0.13, 0.22, 0.05), body); b.position.y = 0.12; g.add(b)
  const n = new THREE.Mesh(RB(0.1, 0.1, 0.08, 0.03), neck); n.position.set(0, 0.2, 0.08); g.add(n)
  const h = new THREE.Mesh(RB(0.08, 0.08, 0.08, 0.03), body); h.position.set(0, 0.26, 0.11); g.add(h)
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 4), M(0xe0b080)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.25, 0.17); g.add(bk)
  const wl = new THREE.Mesh(RB(0.02, 0.08, 0.18, 0.01), M(0x6a707c)); wl.position.set(-0.08, 0.13, -0.01); g.add(wl)
  const wr = wl.clone(); wr.position.x = 0.08; g.add(wr)
  g.userData.wings = [wl, wr]
  return g
}
