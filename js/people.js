// 人の見た目。Kenney Mini Characters（CC0・ボーン入り・アニメ付き）
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js'
import { createFace } from './look.js?v=1'

const BASE = 'assets/chars/'
export const FILES = ['male-a', 'male-b', 'male-c', 'male-d', 'male-f', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f']
const A = { src: {}, clips: null, ready: false }
export const assets = A
export const SCALE = 2.0   // Kenney Mini（身長 0.72）を 1.45m に

// 主役だけ先に読む（準備完了に要る）。ほかは裏で読む
export function loadPeople(manager, first = ['male-a']) {
  const L = new GLTFLoader(manager)
  const get = f => new Promise((ok, ng) => L.load(BASE + 'character-' + f + '.glb', g => { prep(f, g); ok() }, undefined, ng))
  const head = Promise.all(first.map(get))
  const rest = head.then(() => Promise.all(FILES.filter(f => !first.includes(f)).map(f => get(f).catch(() => {}))))
  return { head, rest }
}
function prep(f, g) {
  g.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true } })
  A.src[f] = g.scene
  if (!A.clips) { A.clips = {}; for (const c of g.animations) A.clips[c.name] = c }
}

export class Person {
  constructor(file, o = {}) {
    this.file = file
    this.group = new THREE.Group()
    this.lean = new THREE.Group(); this.group.add(this.lean)
    const src = A.src[file] || A.src['male-a']
    const ch = this.char = skClone(src)
    ch.traverse(m => {
      if (m.isMesh && m.material) {
        m.material = m.material.clone(); m.material.roughness = 0.85; m.material.metalness = 0
        if (o.tint) m.material.color.setHex(o.tint)
      }
    })
    ch.scale.setScalar(o.scale || SCALE)
    this.lean.add(ch)
    this.bones = {}; ch.traverse(b => { if (b.isBone || b.type === 'Object3D') this.bones[b.name] = b })
    this.mixer = new THREE.AnimationMixer(ch)
    this.acts = {}
    for (const n of ['idle', 'walk', 'sprint', 'fall', 'die', 'sit', 'emote-yes', 'emote-no', 'holding-both', 'crouch', 'interact-right', 'pick-up']) {
      const c = A.clips && A.clips[n]; if (!c) continue
      const a = this.mixer.clipAction(c); this.acts[n] = a
      if (n === 'die' || n === 'fall') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true }
    }
    this.cur = null; this.play(o.anim || 'idle', 0); this.mixer.update(Math.random())
    if (o.face) this.addFace(o.face)
  }
  // 表情の板（Kenney の頭は箱なので、前の面に肌色ごと貼る）
  addFace(skin) {
    const head = this.bones.head; if (!head) return
    this.face = createFace({ size: 128, skin, ink: '#2a1d18' })
    // 肌色の下地を敷いた板の上に表情を重ねる
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }))
    const mat = new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
    this.face.mats.push(mat)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), mat); f.position.z = 0.002; f.renderOrder = 3
    g.add(base, f); g.position.set(0, 0.125, 0.171)
    head.add(g); this.faceGroup = g
  }
  setExpr(e) { if (this.face) this.face.set(e) }
  play(n, fade = 0.2, speed = 1) {
    const a = this.acts[n]; if (!a) return
    a.timeScale = speed
    if (this.cur === a) return
    a.reset().setEffectiveWeight(1).fadeIn(fade).play()
    if (this.cur) this.cur.fadeOut(fade)
    this.cur = a; this.curName = n
  }
}
