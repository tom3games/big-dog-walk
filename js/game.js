// 大型犬の散歩 v2（ランナー）。遊びの計算は sim.js（固定60Hz）、ここは three.js の追いかけ視点・入力・音・画面
import * as THREE from 'three'
import { Walk, STEP, ROUTE, LIMIT, LX, OB, BOW_T } from './sim.js?v=2'
import { buildTown } from './town.js?v=2'
import { BigDog } from './critter.js?v=2'
import { loadPeople, Person, assets } from './people.js?v=2'
import { setupLook, enableShadows, createFx, look, addBlobShadow, startFpsMeter } from './look.js?v=2'
import { makeBot } from './bots.js?v=2'
window.__jsUp = true

const $ = id => document.getElementById(id)
const TX = window.BD_TEXT
const coarse = matchMedia('(pointer: coarse)').matches
const LOW = coarse || Math.min(screen.width, screen.height) < 700
let lang = /^ja/.test(navigator.language || 'ja') ? 'ja' : 'en'
try { const l = localStorage.getItem('bd_lang'); if (l) lang = l } catch (e) {}
let muted = false
try { muted = localStorage.getItem('bd_mute') === '1' } catch (e) {}
let tutDone = false
try { tutDone = localStorage.getItem('bd_tut2') === '1' } catch (e) {}
const t = k => TX[lang][k]
const pickA = a => a[Math.floor(Math.random() * a.length)]
startFpsMeter()

// ---------------------------------------------------------------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2))
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 80)
const lk = setupLook(renderer, scene, { exposure: 1.1, sky: 0xffe2c4, ground: 0x6a5048, hemi: 1.2, sunColor: 0xffd2a0, sun: 2.1, sunPos: [-5, 7, -3], fill: 0.6, fillColor: 0xb9c4ff, fillPos: [4, 3, 6] })
enableShadows(renderer, lk.sun, { center: [0, 0, 0], radius: 10, mapSize: LOW ? 1024 : 2048, blur: 3 })
const fx = createFx(scene, camera, renderer, { pool: 140 })
function resize() {
  const W = innerWidth, H = innerHeight
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  camera.fov = W / H < 0.5 ? 70 : W / H < 0.75 ? 64 : 50
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()
const manager = new THREE.LoadingManager()
manager.onProgress = (url, a, b) => { const el = $('loadBar'); if (el) el.style.width = Math.round(a / Math.max(1, b) * 100) + '%' }

// ---------------------------------------------------------------- 音（録音素材だけ）
Snd.def({
  bark: ['snd/bark1.mp3', 'snd/bark2.mp3', 'snd/bark3.mp3', 'snd/bark4.mp3'], burst: ['snd/burst1.mp3', 'snd/burst2.mp3', 'snd/burst3.mp3'],
  whine: 'snd/whine.mp3', grunt: 'snd/grunt.mp3', crow: 'snd/crow.mp3', meow: ['snd/meow1.mp3', 'snd/meow2.mp3'],
  pot: ['snd/pot1.mp3', 'snd/pot2.mp3', 'snd/pot3.mp3'], metal: ['snd/metal1.mp3', 'snd/metal2.mp3'], clang: 'snd/clang.mp3', wood: ['snd/wood1.mp3', 'snd/wood2.mp3'],
  scrape: ['snd/scrape1.mp3', 'snd/scrape2.mp3', 'snd/scrape3.mp3'], thud: ['snd/thud1.mp3', 'snd/thud2.mp3'], cloth: ['snd/cloth1.mp3', 'snd/cloth2.mp3'], leash: 'snd/leash.mp3',
  step: ['snd/step1.mp3', 'snd/step2.mp3', 'snd/step3.mp3'], swish: 'snd/swish.mp3', win: 'snd/win.mp3', lose: 'snd/lose.mp3', bowgood: 'snd/bowgood.mp3', bowbad: 'snd/bowbad.mp3',
  coin: 'snd/coin.mp3', ding: 'snd/ding.mp3', whistle: 'snd/whistle.mp3', applause: 'snd/applause.mp3', click: 'snd/click.mp3', squeak: 'snd/squeak.mp3',
  splash: ['snd/splash1.mp3', 'snd/splash2.mp3'], bell: 'snd/bell.mp3', creak: ['snd/creak1.mp3', 'snd/creak2.mp3'], pop: ['snd/pop1.mp3', 'snd/pop2.mp3'], box: 'snd/box.mp3', spring: 'snd/spring.mp3',
})
Snd.setMute(muted)
const sfx = (n, o) => Snd.play(n, o)
let audioUp = false
function audioOn() { Snd.init(); if (!audioUp) { audioUp = true; Snd.loop('amb', 'snd/amb_street.mp3', 0.3); Snd.loop('bgm', 'snd/bgm_run.mp3', 0.13) } }

// ---------------------------------------------------------------- 状態
let mode = 'loading', w = null, town = null, dog = null, me = null, paused = false, slow = 1, acc = 0
let testInput = null, bot = null, seedNext = 1 + Math.floor(Math.random() * 1e6), endAt = 0
let camLock = false, camX = 0, telopT = 0, nearT = 0, tut = null, stepT = 0
const neighbors = []
const ropeSegs = []
const tmpV = new THREE.Vector3()
const X = (x, y, s) => tmpV.set(x, y, -s)

// 綱（赤い布のリード）
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.6 })
const ropeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true); ropeGeo.translate(0, 0.5, 0); ropeGeo.rotateX(Math.PI / 2)
for (let i = 0; i < 13; i++) { const m = new THREE.Mesh(ropeGeo, ropeMat); m.castShadow = true; m.frustumCulled = false; scene.add(m); ropeSegs.push(m) }
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), ropeMat); scene.add(handle)

// 土ぼこりと水しぶき
const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
const dust = []
for (let i = 0; i < 50; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0, color: 0xc8a878 })); s.visible = false; scene.add(s); dust.push({ s, life: 0, v: new THREE.Vector3() }) }
function puff(x, y, s, n = 2, sp = 0.8, col = 0xc8a878) {
  for (let k = 0; k < n; k++) { const d = dust.find(q => q.life <= 0); if (!d) return; d.life = 0.6 + Math.random() * 0.4; d.s.visible = true; d.s.material.color.setHex(col); d.s.position.set(x + (Math.random() - 0.5) * 0.4, y, -s + (Math.random() - 0.5) * 0.4); d.v.set((Math.random() - 0.5) * sp, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * sp); d.s.scale.setScalar(0.3) }
}
function stepDust(dt) { for (const d of dust) { if (d.life <= 0) continue; d.life -= dt; if (d.life <= 0) { d.s.visible = false; continue } d.s.position.addScaledVector(d.v, dt); d.v.y -= dt * 0.8; d.s.scale.setScalar(0.3 + (1 - d.life) * 0.9); d.s.material.opacity = Math.min(0.75, d.life) } }

// ---------------------------------------------------------------- 文字（日英）
function applyLang() {
  document.documentElement.lang = lang
  document.querySelectorAll('[data-t]').forEach(el => { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v })
  $('btnMute').textContent = muted ? t('muteOff') : t('muteOn')
  if ($('loadText')) $('loadText').textContent = t('loading')
  $('hHomeL').textContent = t('hud').home; $('hM').textContent = t('hud').m; $('hClockL').textContent = t('hud').clock; $('hTreatL').textContent = t('hud').treats
  $('howBow').textContent = t('howBow'); $('howGoal').textContent = t('howGoal')
  $('lPrivacy').textContent = t('privacy')
  const icons = {
    swipe: '<svg viewBox="0 0 52 52"><rect x="4" y="4" width="44" height="44" rx="4" fill="#3f8a5a"/><rect x="18" y="4" width="16" height="44" fill="#5d5b5d"/><path d="M17 4v44M35 4v44" stroke="#f2efe4" stroke-width="2"/><path d="M10 30h32M15 25l-5 5 5 5M37 25l5 5-5 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    jump: '<svg viewBox="0 0 52 52"><rect x="4" y="4" width="44" height="44" rx="4" fill="#f2e6cf"/><ellipse cx="26" cy="42" rx="14" ry="4" fill="#5e7894"/><path d="M26 30V10M20 16l6-6 6 6" fill="none" stroke="#1d1410" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22h36" stroke="#7fb3d8" stroke-width="2.5"/><rect x="12" y="22" width="7" height="8" fill="#4f8fd6"/><rect x="31" y="22" width="7" height="8" fill="#e86a7a"/></svg>',
    side: '<svg viewBox="0 0 52 52"><rect x="4" y="4" width="44" height="44" rx="4" fill="#f2e6cf"/><circle cx="26" cy="20" r="5" fill="#1d1410"/><rect x="23" y="24" width="6" height="12" fill="#1d1410"/><path d="M38 10c-2 10-2 26 0 36" fill="none" stroke="#c8322a" stroke-width="3"/><ellipse cx="38" cy="9" rx="5" ry="4" fill="#d9a564"/><circle cx="38" cy="45" r="3" fill="#c8322a"/></svg>',
  }
  $('howList').innerHTML = t('how').map(([k, a, b]) => `<li>${icons[k]}<div><b>${a}</b><span>${b}</span></div></li>`).join('')
}
applyLang()

// ---------------------------------------------------------------- 画面切り替え
function show(id) { for (const s of ['title', 'how', 'result']) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', id !== 'hud') }
$('btnStart').onclick = () => { audioOn(); sfx('click'); start() }
$('btnHow').onclick = () => { audioOn(); sfx('click'); show('how'); mode = 'how' }
$('btnOk').onclick = () => { audioOn(); sfx('click'); start() }
$('btnLang').onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('bd_lang', lang) } catch (e) {} applyLang() }
$('btnMute').onclick = () => { muted = !muted; Snd.setMute(muted); try { localStorage.setItem('bd_mute', muted ? '1' : '0') } catch (e) {} applyLang(); if (!muted) audioOn() }
$('btnAgain').onclick = () => { audioOn(); sfx('click'); start() }
$('btnTitle').onclick = () => { sfx('click'); toTitle() }
$('btnSave').onclick = () => { const a = document.createElement('a'); a.download = 'big-dog-walk.png'; a.href = $('board').toDataURL('image/png'); a.click(); window.TM && TM.share('save') }
$('btnPost').onclick = () => window.TM && TM.share('x')

// ---------------------------------------------------------------- 世界を作る
function clearWorld() {
  if (town) { town.root.traverse(o => { if (o.geometry) o.geometry.dispose() }); scene.remove(town.root) }
  for (const n of neighbors) scene.remove(n.group); neighbors.length = 0
}
function newWalk(opts = {}) {
  clearWorld()
  w = new Walk(opts.seed ?? seedNext++, { first: !tutDone && !opts.noTut, ...opts })
  town = buildTown(scene, w, { Person })
  if (!dog) { dog = new BigDog(); dog.group.scale.setScalar(1.25); scene.add(dog.group); addBlobShadow(dog.body, 1.5, { stretch: 0.55, opacity: 0.35 }) }
  if (!me) { me = new Person('female-e', { face: 0xf3c29b }); scene.add(me.group); addBlobShadow(me.group, 0.85, { opacity: 0.35 }) }
  dog.wallet.visible = false; dog.shirtOn = false
  me.group.rotation.set(0, Math.PI, 0); me.lean.rotation.set(0, 0, 0)
  camX = 0; $('hTreat').textContent = '0'
  syncWorld(0); place(0)
}
function start(opts = {}) {
  newWalk(opts)
  mode = 'play'; paused = false; slow = 1; acc = 0; endAt = 0; nearT = 0; queue.length = 0
  show('hud'); $('telop').className = 'telop'; $('bow').classList.add('hidden'); $('bang').classList.add('hidden'); $('near').classList.add('hidden'); hideHint()
  tut = (!tutDone && !opts.noTut) ? { step: null, seen: {} } : null
  window.TM && TM.start()
}
function toTitle() { mode = 'title'; show('title'); paused = false; if (!w) newWalk({ noTut: true }) }

// ---------------------------------------------------------------- 入力（なぞる: 左右=列、上=跳ぶ、下=しゃがむ／タップ=跳ぶ）
const ptr = { id: null, x0: 0, y0: 0, t0: 0, fired: false, sx: 0, sy: 0 }
const queue = []
let pendBow = false
const view = $('view')
const SWIPE = () => Math.max(22, Math.min(innerWidth, innerHeight) * 0.055)
function act(k) {
  if (!w || mode !== 'play') return
  if (w.me.st === 'bow') { pendBow = true; return }
  if (queue.length < 3) queue.push(k)
  if (tut) tutAct(k)
}
view.addEventListener('pointerdown', e => {
  if (mode !== 'play') return
  e.preventDefault(); audioOn()
  if (w.me.st === 'bow') { pendBow = true; return }
  ptr.id = e.pointerId; ptr.x0 = ptr.sx = e.clientX; ptr.y0 = ptr.sy = e.clientY; ptr.t0 = performance.now(); ptr.fired = false
  try { view.setPointerCapture(e.pointerId) } catch (er) {}
})
view.addEventListener('pointermove', e => {
  if (e.pointerId !== ptr.id) return
  const dx = e.clientX - ptr.x0, dy = e.clientY - ptr.y0
  if (ptr.fired || Math.hypot(dx, dy) < SWIPE()) return
  // 1回なぞる = 1回（指を離すまで次は出さない。代表作と同じ）
  if (Math.abs(dx) > Math.abs(dy) * 0.9) act(dx > 0 ? 'right' : 'left')
  else act(dy < 0 ? 'up' : 'down')
  ptr.fired = true
})
const ptrEnd = e => {
  if (e.pointerId !== ptr.id) return
  const moved = Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy)
  if (!ptr.fired && performance.now() - ptr.t0 < 320 && moved < SWIPE()) act('up')
  ptr.id = null
}
view.addEventListener('pointerup', ptrEnd); view.addEventListener('pointercancel', e => { if (e.pointerId === ptr.id) ptr.id = null })
addEventListener('keydown', e => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
  audioOn()
  if (e.repeat) return
  if (mode === 'play') {
    if (w.me.st === 'bow' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown')) { pendBow = true; return }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') act('left')
    if (e.code === 'ArrowRight' || e.code === 'KeyD') act('right')
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') act('up')
    if (e.code === 'ArrowDown' || e.code === 'KeyS') act('down')
  } else if (mode === 'result' && (e.code === 'Enter' || e.code === 'Space')) start()
})
function gather() {
  if (bot) return bot(w)
  if (testInput) { const i = { move: 0, jump: false, duck: false, bowTap: false, ...testInput }; testInput = null; return i }
  const i = { move: 0, jump: false, duck: false, bowTap: pendBow }
  pendBow = false
  const k = queue.shift()
  if (k === 'left') i.move = -1; else if (k === 'right') i.move = 1; else if (k === 'up') i.jump = true; else if (k === 'down') i.duck = true
  return i
}

// ---------------------------------------------------------------- 画面座標
function projectXY(x, y, s) {
  const v = new THREE.Vector3(x, y, -s).project(camera)
  if (v.z > 1) return null
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }
}

// ---------------------------------------------------------------- 出来事から演出・音へ
const telopEl = $('telop')
function telop(text, red = false, sec = 1.4) {
  if (tut && tut.step) return
  telopEl.textContent = text; telopEl.className = 'telop on' + (red ? ' red' : ''); telopT = sec
}
function nearPop(n) {
  const el = $('near'); $('nearTxt').textContent = pickA(t('telop').near); $('nearN').textContent = n >= 2 ? t('telop').chain(n) : ''
  el.classList.remove('hidden', 'pop'); void el.offsetWidth; el.classList.add('pop'); nearT = 0.9
}
function hint(kind, key) { const h = $('hint'); h.className = 'hint ' + kind; $('hintText').textContent = t('tut')[key] }
function hideHint() { $('hint').className = 'hint hidden' }
const T = () => t('telop')
const HIT_SFX = {
  banana: () => { sfx('squeak', { rate: 0.8 }); sfx('thud', { delay: 0.25 }); sfx('wood', { delay: 0.35, vol: 0.7 }) },
  manhole: () => { sfx('metal'); sfx('thud', { delay: 0.1 }) },
  cement: () => { sfx('splash', { rate: 0.6, vol: 0.8 }); sfx('thud', { delay: 0.12 }) },
  puddle: () => { sfx('splash'); sfx('splash', { delay: 0.12, rate: 1.2, vol: 0.7 }) },
  cat: () => { sfx('meow', { rate: 1.1 }); sfx('thud', { delay: 0.15 }) },
  skate: () => { sfx('wood'); sfx('scrape', { delay: 0.2 }) },
  bar: () => { sfx('cloth'); sfx('cloth', { delay: 0.12 }); sfx('clang', { delay: 0.2, vol: 0.5 }) },
  crow: () => { sfx('crow', { vol: 1 }); sfx('cloth', { rate: 1.4 }) },
  sprinkler: () => { sfx('splash', { rate: 1.3 }); sfx('splash', { delay: 0.2, rate: 1.5, vol: 0.7 }) },
  bike: () => { sfx('bell'); sfx('metal', { delay: 0.1 }); sfx('clang', { delay: 0.3, vol: 0.7 }) },
  pot: () => { sfx('pot'); sfx('pot', { delay: 0.12, vol: 0.7 }) },
  truck: () => { sfx('metal'); sfx('thud', { delay: 0.1 }); sfx('clang', { delay: 0.25, vol: 0.6 }) },
  gate: () => { sfx('clang'); sfx('creak', { delay: 0.1 }) },
  cart: () => { sfx('box'); sfx('wood', { delay: 0.15 }); sfx('box', { delay: 0.3, rate: 0.9 }) },
  sign: () => { sfx('clang', { rate: 0.8 }); sfx('thud', { delay: 0.15 }) },
  walker: () => { sfx('thud'); sfx('cloth', { delay: 0.1 }) },
  pole: () => { sfx('clang', { rate: 0.7, vol: 1 }); sfx('thud', { delay: 0.08 }) },
  wedding: () => { sfx('clang'); sfx('cloth', { delay: 0.1 }); sfx('thud', { delay: 0.3 }) },
  runner: () => { sfx('thud'); sfx('cloth', { delay: 0.1 }) },
}
function onEvents() {
  for (const e of w.ev) {
    switch (e.k) {
      case 'swap': sfx('swish', { vol: 0.28, rate: 1.4 }); break
      case 'jump': sfx('swish', { vol: 0.45, rate: 1.1 }); break
      case 'land': sfx('step', { vol: 0.35 }); break
      case 'duck': sfx('cloth', { vol: 0.4 }); break
      case 'treat': sfx('pop', { vol: 0.55 }); $('hTreat').textContent = w.stats.treats; break
      case 'near':
        sfx('ding', { vol: 0.45, rate: 1 + Math.min(0.6, e.chain * 0.05) })
        nearPop(e.chain)
        fx.burst(X(w.me.x, 1.0, w.me.s + 0.5).clone(), { count: 10, color: 0xffe08a, speed: 1.4, size: 0.14 })
        break
      case 'hit': {
        ;(HIT_SFX[e.kind] || HIT_SFX.walker)()
        if (e.why === 'wrap') { sfx('leash'); sfx('leash', { delay: 0.15, rate: 0.8 }) }
        const pos = X(w.me.x, 0.8, w.me.s + 0.4).clone()
        const wet = e.kind === 'puddle' || e.kind === 'sprinkler' || e.kind === 'cement'
        fx.moment(pos, { burst: { count: 22, color: wet ? 0xbfe4ff : e.kind === 'pot' ? 0xc8784a : 0xfff0a0, speed: 2.2, size: 0.18 }, shake: [0.035, 0.35], zoom: [0.07, 0.35], hitstop: 110 })
        if (wet) puff(w.me.x, 0.4, w.me.s + 0.3, 8, 2.2, 0x9fc8e8)
        me.setExpr('busted'); dog.setExpr('alert')
        telop(e.why === 'wrap' ? (T().wrap[e.kind] || T().wrap.pole) : (T().hit[e.kind] || ''), true, 1.5)
        const it = town.obs.get(e.id); if (it) it.hitT = 0.001
        $('near').classList.add('hidden')
        break
      }
      case 'yank': sfx('leash', { vol: 0.8 }); sfx('grunt', { vol: 0.5 }); fx.shake(0.015, 0.2); telop(T().yank, false, 0.9); break
      case 'alert': sfx('bark', { vol: 0.9 }); popBang(e.id); if (tut) tutDart(); break
      case 'bolt': sfx('burst', { vol: 0.9 }); fx.shake(0.012, 0.25); break
      case 'reach': {
        const a = town.actors.get(e.id); if (a) a.hitT = 0.001
        if (e.target === 'cat') sfx('meow'); else if (e.target === 'pigeon') { sfx('cloth'); sfx('cloth', { delay: 0.1, rate: 1.3 }) } else if (e.target === 'smalldog') { sfx('bark', { rate: 1.9, vol: 0.7 }); sfx('bark', { rate: 2.0, vol: 0.6, delay: 0.2 }) } else sfx('metal', { vol: 0.6 })
        telop(T().reach[e.target], false, 1.2)
        break
      }
      case 'calm': $('bang').classList.add('hidden'); dog.setExpr('happy'); break
      case 'obStart': {
        const o = w.obs[e.id]
        if (o.kind === 'bike') sfx('bell'); else if (o.kind === 'gate') sfx('creak'); else if (o.kind === 'crow') sfx('crow', { vol: 0.8 }); else if (o.kind === 'pot') sfx('swish', { rate: 0.7, vol: 0.5 }); else if (o.kind === 'cart') sfx('wood', { vol: 0.4, rate: 1.3 })
        break
      }
      case 'bowStart': startBowUI(e.who); break
      case 'bowGrade': gradeBowUI(e.grade); break
      case 'wallet': sfx('coin'); sfx('ding', { delay: 0.3 }); telop(T().wallet); dog.wallet.visible = true; break
      case 'medal': sfx('whistle'); sfx('applause', { vol: 0.7 }); telop(T().medal, false, 2); break
      case 'end': endT(e.home); break
    }
  }
  w.ev.length = 0
}
function popBang(id) {
  const dz = w.darts[id]
  $('bangKind').textContent = t('kinds')[dz.target]
  const b = $('bang'); b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''
}

// ---------------------------------------------------------------- チュートリアル（初回だけ。障害物の手前で時間をゆっくりにして1つずつ）
const TUT_NEED = { swipe: ['left', 'right'], jump: ['up'], duck: ['down'] }
function tutTick(rdt) {
  if (!tut) return
  if (tut.step) {
    tut.t += rdt
    const s = tut.step
    let ok = false
    if (s === 'side') ok = w.me.lane === w.dog.lane
    if (s === 'dart') ok = !w.dog.dart || w.me.lane === w.dog.dart.side
    // できていても案内は少しだけ見せる（一瞬で消えて読めないのを防ぐ）
    if (ok) slow = 1
    if ((ok && tut.t > 1.1) || tut.t > 6 || bot) tutEnd()
    return
  }
  for (const o of w.obs) {
    if (!o.tut || tut.seen[o.tut] || o.mePassed) continue
    const ahead = o.s - w.me.s
    const lead = o.tut === 'jump' ? 0.24 : o.tut === 'duck' ? 0.3 : 0.55
    if (o.tut === 'side' ? (w.dog.lane !== 0 && ahead < 8 && ahead > 1) : (ahead < w.v * lead + 0.3 && ahead > 0.3)) { tutBegin(o.tut); break }
  }
}
function tutBegin(s) { tut.seen[s] = true; tut.step = s; tut.t = 0; slow = 0.12; hint(s === 'jump' ? 'up' : s === 'duck' ? 'down' : 'swipe', s); telopEl.className = 'telop'; telopT = 0 }
function tutEnd() { if (tut.step === 'dart' && !tutDone) { tutDone = true; try { localStorage.setItem('bd_tut2', '1') } catch (e) {} } tut.step = null; slow = 1; hideHint() }
function tutAct(k) { if (tut.step && TUT_NEED[tut.step] && TUT_NEED[tut.step].includes(k)) { slow = 1; setTimeout(tutEnd, 350) } }
function tutDart() { if (!tut.seen.dart) { tut.seen.dart = true; tut.step = 'dart'; tut.t = 0; slow = 0.15; hint('swipe', 'dart'); telopEl.className = 'telop'; telopT = 0 } }
function tutCheckDone() { if (tut && tut.seen.dart && !tut.step && !w.dog.dart && !tutDone) { tutDone = true; try { localStorage.setItem('bd_tut2', '1') } catch (e) {} } }

// ---------------------------------------------------------------- お辞儀の画面
function arcPath(a0, a1) {
  const P = a => [20 + 100 * Math.sin(a * Math.PI / 180), 120 - 100 * Math.cos(a * Math.PI / 180)]
  const [x0, y0] = P(a0), [x1, y1] = P(a1)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A100 100 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}
document.querySelector('#bowSvg path').setAttribute('d', arcPath(0, 90)); $('bowGood').setAttribute('d', arcPath(50, 74)); $('bowDeep').setAttribute('d', arcPath(74, 90))
$('bowTicks').innerHTML = [0, 15, 30, 45, 60, 75, 90].map(a => { const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180); return `<line x1="${20 + 90 * s}" y1="${120 - 90 * c}" x2="${20 + 100 * s}" y2="${120 - 100 * c}"/>` }).join('')
const WHO_FILE = { yaoya: 'male-d', koji: 'male-c', sakan: 'male-f', white: 'female-c', catlady: 'female-f', kid: 'male-b', yamada: 'female-d', gomi: 'male-d', suzuki: 'male-d', student: 'male-b', tanaka: 'female-f', seiso: 'male-f', yamada2: 'female-d', deliv: 'male-f', walker: 'female-c', bride: 'female-c', race: 'male-d' }
function startBowUI(who) {
  $('bowWho').textContent = t('who')[who] || who
  $('bowGradeL').textContent = tut && !tut.bowSeen ? t('tut').bow : ''
  if (tut) tut.bowSeen = true
  $('bow').classList.remove('hidden'); $('bang').classList.add('hidden'); $('near').classList.add('hidden'); if (telopT > 0.4) telopT = 0.4
  sfx('cloth', { vol: 0.6 })
  me.setExpr('panic')
  for (const n of neighbors) scene.remove(n.group); neighbors.length = 0
  if (who !== 'pole' && WHO_FILE[who]) {
    const p = new Person(WHO_FILE[who], { anim: 'emote-no', tint: who === 'bride' ? 0xffffff : who === 'white' ? 0xf4f4f4 : undefined })
    p.group.position.set(w.me.x, 0, -(w.me.s + 1.25)); p.group.rotation.y = 0
    scene.add(p.group); neighbors.push(p)
  }
}
function gradeBowUI(g) {
  $('bowGradeL').textContent = t('bowGrade')[g] + '  ' + t('bowSay')[g]
  if (g === 'deep') { sfx('bowgood'); sfx('ding', { delay: 0.2, vol: 0.6 }); me.setExpr('relief'); for (const n of neighbors) n.play('emote-yes') }
  else if (g === 'good') { sfx('bowgood', { rate: 0.9 }); me.setExpr('normal'); for (const n of neighbors) n.play('idle') }
  else { sfx('bowbad'); me.setExpr('busted') }
}
function endBowUI() { $('bow').classList.add('hidden'); for (const n of neighbors) scene.remove(n.group); neighbors.length = 0; me.setExpr('normal'); dog.setExpr('normal') }

// ---------------------------------------------------------------- 終わり
function endT(home) {
  endAt = performance.now()
  if (home) { sfx('win'); telop(T().home, false, 2); dog.setExpr('happy') }
  else { sfx('lose'); telop(T().late, true, 2) }
  window.TM && TM.end(w.result.total, home)
}
function showResult() {
  mode = 'result'
  drawBoard()
  const r = w.result, rank = t('ranks')[r.rank]
  const url = 'https://tom3games.github.io/big-dog-walk/'
  $('btnPost').href = 'https://x.com/intent/post?text=' + encodeURIComponent(t('postText')(r, rank) + '\n' + t('tag')) + '&url=' + encodeURIComponent(url)
  show('result')
}
// 犬のうれしい顔を1枚撮る（回覧板に貼る写真）
const photoRT = new THREE.WebGLRenderTarget(256, 256); photoRT.texture.colorSpace = THREE.SRGBColorSpace
const photoLight = new THREE.PointLight(0xfff0dc, 0, 6, 1.5); scene.add(photoLight)
const photoCam = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
function dogPhoto() {
  dog.setExpr('happy'); dog.pose(0, { speed: 0, ears: 0.1, happy: 1, sit: 1, look: 0 })
  dog.group.updateMatrixWorld(true)
  const hp = new THREE.Vector3(); dog.head.getWorldPosition(hp)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(dog.group.quaternion)
  photoCam.position.copy(hp).addScaledVector(fwd, 2.0).add(new THREE.Vector3(0.4, 0.1, 0)); photoCam.lookAt(hp.x, hp.y - 0.1, hp.z)
  photoLight.position.copy(photoCam.position).add(new THREE.Vector3(0, 0.6, 0)); photoLight.intensity = 6
  const hidden = []
  for (const s of ropeSegs.concat([handle])) { hidden.push([s, s.visible]); s.visible = false }
  renderer.setRenderTarget(photoRT); renderer.render(scene, photoCam); renderer.setRenderTarget(null); photoLight.intensity = 0
  for (const [s, v] of hidden) s.visible = v
  const px = new Uint8Array(256 * 256 * 4); renderer.readRenderTargetPixels(photoRT, 0, 0, 256, 256, px)
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), id = x.createImageData(256, 256)
  for (let y = 0; y < 256; y++) id.data.set(px.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024)
  x.putImageData(id, 0, 0); return c
}
function drawBoard() {
  const c = $('board'), x = c.getContext('2d'), W = c.width, H = c.height, r = w.result
  const hand = '"Yomogi","Hiragino Maru Gothic ProN",sans-serif', gothic = '"BIZ UDPGothic","Hiragino Sans",sans-serif'
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#b98552'); g.addColorStop(1, '#8e5e34'); x.fillStyle = g; x.fillRect(0, 0, W, H)
  x.strokeStyle = 'rgba(70,40,20,.25)'; x.lineWidth = 2; for (let i = 0; i < 26; i++) { x.beginPath(); const y0 = Math.random() * H; x.moveTo(0, y0); x.bezierCurveTo(W * 0.3, y0 + 20, W * 0.6, y0 - 20, W, y0 + 8); x.stroke() }
  x.fillStyle = '#fbf7ee'; x.save(); x.translate(W / 2, 70); x.rotate(-0.008); x.fillRect(-W / 2 + 36, 0, W - 72, H - 110); x.restore()
  x.fillStyle = '#c4c7cc'; x.fillRect(W / 2 - 120, 28, 240, 62); x.fillStyle = '#9aa0a8'; x.fillRect(W / 2 - 120, 76, 240, 14); x.fillStyle = '#5a5f66'; x.beginPath(); x.arc(W / 2, 58, 12, 0, 7); x.fill()
  x.fillStyle = '#2a2520'; x.font = `22px ${gothic}`; x.textAlign = 'left'; x.fillText(lang === 'ja' ? '回覧板' : 'NEIGHBORHOOD BOARD', 60, 128)
  try {
    const ph = dogPhoto(); x.save(); x.translate(W - 210, 112); x.rotate(0.06)
    x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 10; x.fillRect(-10, -10, 170, 196); x.shadowBlur = 0
    x.drawImage(ph, 0, 0, 150, 150); x.fillStyle = '#2a2520'; x.font = `19px ${hand}`; x.textAlign = 'center'; x.fillText(t('dogName') + (lang === 'ja' ? '（ごきげん）' : ' (happy)'), 75, 176)
    x.fillStyle = 'rgba(240,220,150,.75)'; x.fillRect(35, -22, 80, 24); x.restore()
  } catch (e) {}
  x.textAlign = 'left'; x.fillStyle = '#1d1410'; x.font = `${lang === 'ja' ? 42 : 34}px ${hand}`; x.fillText(t('listTitle'), 60, 196)
  x.font = `20px ${gothic}`; x.fillStyle = r.home ? '#1f7a4c' : '#d4302a'; x.fillText(r.home ? t('homeOk') + '（' + t('left')(fmtTime(Math.max(0, LIMIT - r.time))) + '）' : t('homeLate'), 62, 234)
  x.font = `17px ${gothic}`; x.fillStyle = '#5a5048'; x.fillText(t('stat')(r), 62, 262)
  const rows = r.list.filter(i => !i.good || i.item === 'wallet' || i.item === 'medal')
  let y = 340
  if (!rows.length) { x.fillStyle = '#1f7a4c'; x.font = `34px ${hand}`; x.fillText(t('listNone'), 70, y + 30) }
  const maxRows = rows.length > 7 ? 6 : 7
  rows.slice(0, maxRows).forEach((it, i) => {
    x.strokeStyle = 'rgba(29,79,156,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(60, y + 30); x.lineTo(W - 60, y + 30); x.stroke()
    x.fillStyle = it.good ? '#1f7a4c' : '#1d1410'; x.font = `24px ${hand}`; x.textAlign = 'left'
    const who = t('who')[it.who] || it.who, item = t('item')[it.item] || it.item
    x.fillText(`${i + 1}. ${who}`, 62, y); x.font = `19px ${hand}`; x.fillStyle = '#5a5048'; x.fillText(item, 92, y + 24)
    x.textAlign = 'right'; x.font = `25px ${gothic}`; x.fillStyle = it.cost < 0 ? '#1f7a4c' : '#1d1410'
    x.fillText((it.cost < 0 ? '+' : '') + '¥' + Math.abs(it.cost).toLocaleString(), W - 64, y)
    if (it.grade) { x.font = `17px ${gothic}`; x.fillStyle = it.grade === 'deep' ? '#d4302a' : '#7a6e62'; x.fillText(t('bowGrade')[it.grade] + (it.base && it.base !== it.cost ? `  ¥${it.base.toLocaleString()}` : ''), W - 64, y + 22) }
    y += 50
  })
  if (rows.length > maxRows) { const rest = rows.slice(maxRows).reduce((a, b) => a + b.cost, 0); x.textAlign = 'left'; x.font = `20px ${hand}`; x.fillStyle = '#5a5048'; x.fillText(lang === 'ja' ? `ほか ${rows.length - maxRows} 件（¥${rest.toLocaleString()}）` : `${rows.length - maxRows} more (¥${rest.toLocaleString()})`, 70, y + 2) }
  y = 742
  x.strokeStyle = '#1d1410'; x.lineWidth = 3; x.beginPath(); x.moveTo(60, y - 34); x.lineTo(W - 60, y - 34); x.stroke()
  x.textAlign = 'left'; x.fillStyle = '#1d1410'; x.font = `30px ${hand}`; x.fillText(t('total'), 64, y + 6)
  x.textAlign = 'right'; x.font = `46px ${gothic}`; x.fillStyle = r.total > 0 ? '#d4302a' : '#1f7a4c'; x.fillText((r.total < 0 ? '+' : '') + '¥' + Math.abs(r.total).toLocaleString(), W - 64, y + 12)
  let nx = W - 64; x.font = `18px ${gothic}`
  for (const [on, label, col] of [[r.medal, t('medalNote'), '#c99a1a'], [r.wallet, t('walletNote'), '#1f7a4c']]) { if (!on) continue; const tw = x.measureText(label).width + 22; nx -= tw; x.fillStyle = col; x.fillRect(nx, y + 40, tw, 30); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(label, nx + 11, y + 62); nx -= 10 }
  const rank = t('ranks')[r.rank]
  x.font = `${rank.length > 9 ? 22 : 27}px ${gothic}`
  const rw = Math.max(110, x.measureText(rank).width / 2 + 34)
  x.save(); x.translate(64 + rw, H - 92); x.rotate(-0.1)
  x.strokeStyle = '#d4302a'; x.lineWidth = 6; x.globalAlpha = 0.88; x.beginPath(); x.ellipse(0, 0, rw, 50, 0, 0, 7); x.stroke()
  x.fillStyle = '#d4302a'; x.textAlign = 'center'; x.fillText(rank, 0, 9); x.restore(); x.globalAlpha = 1
}
const fmtTime = s => { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, '0')}` }

// ---------------------------------------------------------------- 障害物と相手の見た目を毎フレーム
function syncWorld(dt) {
  if (!town) return
  const ms = w.me.s
  for (const o of w.obs) {
    let it = town.obs.get(o.id)
    if (o.done) { if (it) town.dropOb(o.id); continue }
    if (!it && o.s - ms < 62) it = town.makeOb(o)
    if (!it) continue
    it.t += dt
    it.g.position.set(o.x, 0, -o.s)
    const P = it.parts
    for (const p of [P.pp, P.rider, P.bride, P.groom, P.ph]) if (p) p.mixer.update(dt)
    if (it.hitT) it.hitT += dt
    const k = o.kind
    if (k === 'crow' && P.crow) { P.crow.userData.wings.forEach((wg, i) => wg.rotation.z = Math.sin(it.t * 30 + i * 3) * 0.9 * (i ? 1 : -1)); P.crow.position.y = 1.0 + Math.sin(it.t * 6) * 0.08 }
    if (k === 'sprinkler') P.drops.forEach((d, i) => { const u = ((it.t * 0.9 + i / P.drops.length) % 1), a = Math.sin(it.t * 2.2) * 1.3 + (i % 3 - 1) * 0.15; d.position.set(Math.sin(a) * u * 1.4, 0.3 + Math.sin(u * Math.PI) * 1.5, -0.6 + Math.cos(a) * u * 0.9) })
    if (k === 'puddle' && P.ring) { const u = (it.t * 0.8) % 1; P.ring.scale.setScalar(1 + u * 2.5); P.ring.material.opacity = 0.6 * (1 - u) }
    if (k === 'cat' && P.z) { P.z.position.y = 0.55 + Math.sin(it.t * 2) * 0.05; if (it.hitT) { P.cat.group.position.y = Math.min(1.4, it.hitT * 4); P.cat.group.rotation.z = it.hitT * 8 } }
    if (k === 'gate' && P.hinge) P.hinge.rotation.y = -o.side * (o.open || 0) * 1.5 + (o.st === 'wait' && o.s - ms < 18 ? Math.sin(it.t * 40) * 0.03 : 0)
    if (k === 'pot' && P.pot) { P.pot.position.y = o.fallY; const fk = (4.6 - o.fallY) / 4.6; P.sh.material.opacity = o.s - ms < 18 ? Math.min(0.6, 0.2 + fk * 0.4) : 0; P.sh.scale.setScalar(0.6 + fk * 0.5); if (o.fallY <= 0) P.pot.rotation.z = 0.5 }
    if (k === 'truck' && P.light) P.light.material.emissiveIntensity = 1 + Math.sin(it.t * 10) * 0.8
    if (k === 'bike' && P.bk) { P.bk.children[0].rotation.x += dt * 12; P.bk.children[1].rotation.x += dt * 12; if (it.hitT) P.bk.rotation.z = Math.min(1.4, it.hitT * 5) }
    if (k === 'skate' && P.board && it.hitT) { P.board.position.y = Math.sin(Math.min(1, it.hitT * 2) * Math.PI) * 1.2; P.board.rotation.x = it.hitT * 9 }
    if (k === 'sign' && it.hitT) it.g.children[0].rotation.x = -Math.min(1.5, it.hitT * 5)
    if ((k === 'walker' || k === 'runner') && P.pp && it.hitT && P.pp.curName !== 'die') P.pp.play('die', 0.1)
    if (k === 'wedding' && it.hitT) { if (P.bride && P.bride.curName !== 'fall') P.bride.play('fall'); if (P.groom && P.groom.curName !== 'fall') P.groom.play('fall'); if (P.ph) P.ph.play('emote-no') }
    if (k === 'bar' && it.hitT) it.g.rotation.z = Math.min(0.5, it.hitT * 2) * (o.lane >= 0 ? 1 : -1)
  }
  for (const dz of w.darts) {
    let a = town.actors.get(dz.id)
    if (!a && dz.ts - ms < 70 && dz.ts - ms > -20) a = town.makeActor(dz)
    if (!a) continue
    a.t += dt; if (a.hitT) a.hitT += dt
    const P = a.parts
    if (P.madam) P.madam.mixer.update(dt)
    if (P.cat && a.hitT) { const c = P.cat.group; c.position.y = 1.21 + Math.min(1.6, a.hitT * 3); c.position.x = dz.side * (0.38 + Math.min(1.5, a.hitT * 2)) }
    if (P.birds) P.birds.forEach((b, i) => { if (a.hitT) { b.position.y = a.hitT * (1.6 + i * 0.3); b.position.x += Math.sin(i * 2) * dt * 2; b.userData.wings.forEach((wg, k2) => wg.rotation.z = Math.sin(a.t * 40 + k2) * 0.8) } else b.rotation.y += Math.sin(a.t * 3 + i) * dt })
    if (P.chi) P.chi.group.position.x = Math.sin(a.t * 40) * (dz.st === 'go' ? 0.01 : 0.004)
    if (P.smoke) P.smoke.forEach((s, i) => { const k2 = (a.t * 0.4 + i / 4) % 1; s.position.y = 2.2 + k2 * 1.6; s.material.opacity = 0.45 * (1 - k2); s.scale.setScalar(0.6 + k2 * 1.4) })
    if (dz.ts - ms < -20) { town.root.remove(a.g); town.actors.delete(dz.id) }
  }
  for (const e of town.extras) {
    if (e.glint) { e.glint.material.opacity = e.ex.got ? 0 : 0.6 + Math.sin(performance.now() / 160) * 0.4; e.g.visible = !e.ex.got }
    if (e.tape) e.tape.visible = !e.ex.done
  }
  town.updateTreats(ms, performance.now() / 1000)
}

// ---------------------------------------------------------------- 毎フレームの置き直し
function place(dt) {
  const d = w.dog, m = w.me
  dog.group.position.set(d.x, 0, -d.s)
  dog.group.rotation.y = Math.PI - d.hd
  const dz = d.dart
  const lookA = dz && dz.st !== 'done' ? -dz.side * 0.9 : 0
  // 物干し竿の下をくぐったら、たまにシャツを着て出てくる
  for (const o of w.obs) if (o.kind === 'bar' && !o.shirtChecked && d.s > o.s && Math.abs(d.x - o.x) < 0.8) { o.shirtChecked = true; if (o.id % 4 === 1 && !dog.shirtOn) { dog.shirtOn = true; telop(T().shirt, false, 1.3) } }
  dog.pose(dt, { speed: m.st === 'bow' ? 0 : w.v, ears: d.ears, look: lookA, sit: d.sit, happy: d.happy > 0.3, air: d.y > 0.05, y: d.y / 1.25, lean: -d.vx * 0.08, shirt: dog.shirtOn })
  if (mode === 'play' && m.st === 'run') {
    if (dz && dz.st === 'alert') dog.setExpr('alert')
    else if (dz && dz.st === 'go') dog.setExpr('happy')
    else if (d.happy > 0.5) dog.setExpr('happy')
    else if (dog.expr !== 'normal' && dog.expr !== 'happy') dog.setExpr('normal')
  } else if (m.st === 'bow') dog.setExpr('sad')
  me.group.position.set(m.x, m.y, -m.s)
  let lx = 0, py = 0, ry = Math.PI
  if (m.st === 'tumble') {
    me.play('holding-both', 0.1); lx = 1.4; py = 0.18; ry = Math.PI - Math.atan2(d.x - m.x, d.s - m.s) * 0.5
    if (me.face && me.face.expr !== 'busted') me.setExpr('busted')
    stepT += dt; if (stepT > 0.22) { stepT = 0; sfx('scrape', { vol: 0.6 }); puff(m.x, 0.2, m.s + 0.7, 2, 1.2) }
  } else if (m.st === 'bow') me.play('idle', 0.2)
  else if (m.st === 'getup') { me.play('crouch', 0.15); lx = 0.3 }
  else if (w.phase === 'end' && w.result && w.result.home) { me.play('emote-yes', 0.3); ry = 0 }
  else if (m.y > 0.05) { me.play('jump', 0.08); lx = -0.15 }
  else if (m.duck > 0) { me.play('crouch', 0.06); lx = 0.5; py = -0.05 }
  else { me.play('sprint', 0.15, 0.8 + w.v / 12); lx = -0.12; if (me.face && (me.face.expr === 'busted' || me.face.expr === 'panic')) me.setExpr('normal'); stepT += dt * w.v; if (stepT > 2.4) { stepT = 0; sfx('step', { vol: 0.18 }) } }
  const lz = THREE.MathUtils.clamp((m.lane * LX - m.x) * 0.35, -0.35, 0.35)
  me.group.rotation.y = ry
  me.lean.rotation.set(lx, 0, lz)
  me.lean.position.y = py
  const tb = me.bones.torso
  if (tb) tb.rotation.x = m.st === 'bow' ? m.bowA * Math.PI / 180 * 0.95 : 0
  if (me.bones.head) me.bones.head.rotation.x = m.st === 'bow' ? m.bowA * Math.PI / 180 * 0.15 : 0
  me.group.visible = !(m.st === 'run' && m.inv > 0 && Math.floor(m.inv * 12) % 2 === 1)
  const R = w.rope
  for (let i = 0; i < ropeSegs.length; i++) {
    const a = R[i], b = R[i + 1], s = ropeSegs[i]
    s.position.set(a.x, a.y, -a.s); const L = Math.hypot(b.x - a.x, b.y - a.y, b.s - a.s) || 0.001
    s.scale.set(1, 1, L); s.lookAt(b.x, b.y, -b.s)
  }
  handle.position.set(R[0].x, R[0].y, -R[0].s)
  for (const n of neighbors) n.mixer.update(dt)
}

// ---------------------------------------------------------------- カメラ（自分の斜め後ろ・高め。前の道が見える）
const camPos = new THREE.Vector3(0, 3.2, 4), camLook = new THREE.Vector3()
function updateCamera(dt) {
  const d = w.dog, m = w.me
  if (mode === 'title' || mode === 'how' || mode === 'loading') {
    const tt = performance.now() / 1000
    camPos.set(Math.sin(tt * 0.15) * 1.2 + 1.4, 1.7, -(m.s + 6.8))
    camera.position.copy(camPos); camera.lookAt(d.x * 0.5, 0.9, -(m.s + 1.6)); return
  }
  const k = 1 - Math.exp(-dt * 5)
  if (m.st === 'bow') {
    const sd = m.x > 0.1 ? -1 : 1
    camX += (THREE.MathUtils.clamp(m.x + sd * 3.0, -3.1, 3.1) - camX) * k
    camPos.set(camX, camPos.y + (1.65 - camPos.y) * k, -(m.s - 2.3)); camera.position.copy(camPos)
    camLook.lerp(new THREE.Vector3(m.x, 0.8, -(m.s + 0.7)), k); camera.lookAt(camLook); return
  }
  camX += (m.x * 0.55 + d.x * 0.12 - camX) * k
  const yy = m.st === 'tumble' ? 3.3 : 3.9
  camPos.set(camX, camPos.y + (yy - camPos.y) * k, -(m.s - 4.6))
  camera.position.copy(camPos)
  camLook.set(camX * 0.85, 0.2, -(m.s + 8.5))
  camera.lookAt(camLook)
}

// ---------------------------------------------------------------- HUD
function hud(dt) {
  $('hDist').textContent = Math.max(0, Math.round(ROUTE - w.me.s))
  const rem = Math.max(0, LIMIT - w.t)
  $('hClock').textContent = fmtTime(Math.ceil(rem))
  $('hClock').parentElement.classList.toggle('late', rem < 30)
  const dz = w.dog.dart, b = $('bang')
  if (dz && dz.st !== 'done' && w.me.st === 'run' && !(tut && tut.step && tut.step !== 'dart')) {
    const q = projectXY(dz.tx, dz.target === 'cat' ? 1.9 : dz.target === 'yakiimo' ? 2.4 : dz.target === 'pigeon' ? 0.9 : 1.5, dz.ts)
    if (q) { b.classList.remove('hidden'); b.style.left = Math.max(50, Math.min(innerWidth - 50, q.x)) + 'px'; b.style.top = Math.max(150, Math.min(innerHeight * 0.55, q.y)) + 'px' }
  } else b.classList.add('hidden')
  if (telopT > 0) { telopT -= dt; if (telopT <= 0) telopEl.className = 'telop' }
  if (nearT > 0) { nearT -= dt; if (nearT <= 0) $('near').classList.add('hidden') }
  if (w.me.st === 'bow' && w.bow) $('bowNeedle').setAttribute('transform', `rotate(${w.me.bowA.toFixed(1)} 20 120)`)
  if (w.me.st !== 'bow' && !$('bow').classList.contains('hidden')) endBowUI()
}

// ---------------------------------------------------------------- ループ（遊びは固定60Hz、演出は実時間）
let last = performance.now()
function frame(now) {
  requestAnimationFrame(frame)
  const rdt = Math.min(0.05, (now - last) / 1000); last = now
  if (!w || mode === 'loading') { renderer.render(scene, camera); return }
  const vdt = fx.update(rdt)
  if (mode === 'play' && !paused) {
    if (tut) { tutTick(rdt); tutCheckDone() }
    if (vdt > 0) {
      acc += rdt * slow
      let n = 0
      while (acc >= STEP && n < 6) { w.step(gather()); onEvents(); acc -= STEP; n++ }
      if (n === 6) acc = 0
    }
    if (w.phase === 'end') { if (!endAt) endAt = now; if (now - endAt > 1600 && mode === 'play') showResult() }
  }
  const sdt = mode === 'play' ? rdt * Math.max(0.15, slow) : rdt
  syncWorld(sdt)
  me.mixer.update(sdt)   // 骨のアニメを先に。お辞儀の胴の角度はそのあとで上書きする
  place(sdt)
  stepDust(rdt)
  if (!camLock) updateCamera(rdt)
  const sc = new THREE.Vector3(w.me.x, 0, -(w.me.s + 4)), dir = lk.sun.position.clone().sub(lk.sun.target.position).normalize()
  lk.sun.target.position.copy(sc); lk.sun.position.copy(sc).addScaledVector(dir, 36); lk.sun.target.updateMatrixWorld()
  if (scene.userData.sky) scene.userData.sky.position.copy(camera.position)
  if (mode === 'play') hud(rdt)
  look.update()
  fx.applyCamera()
  renderer.render(scene, camera)
}

// ---------------------------------------------------------------- 起動
const { head, rest } = loadPeople(manager, ['female-e'])
rest.then(() => { assets.ready = true })
head.then(() => {
  newWalk({ noTut: true, seed: 7 })
  mode = 'title'; show('title')
  const L = $('loading'); L.classList.add('done'); setTimeout(() => L.remove(), 500)
  window.__bdReady = true
}).catch(err => { $('loadText').textContent = 'load error: ' + err.message })
setTimeout(() => { const L = $('loading'); if (L && !window.__bdReady) L.classList.add('done') }, 12000)
requestAnimationFrame(frame)

// ---------------------------------------------------------------- 検証用の窓口
window.bd = {
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, fps: window.__lookFps }),
  get w() { return w }, get mode() { return mode }, get lang() { return lang }, get tut() { return tut },
  start: o => start({ noTut: true, ...o }), startTut: o => { tutDone = false; start(o) },
  dbg: { pause: v => { paused = v ?? !paused }, step: n => { for (let i = 0; i < (n || 1); i++) { w.step(gather()); onEvents() } }, slow: v => { slow = v } },
  input: v => { testInput = v }, bot: (k, seed) => { bot = k ? makeBot(k, seed || 1) : null },
  obXY: (id, y = 0.8) => { const o = w.obs[id]; return projectXY(o.x, y, o.s + o.len / 2) },
  laneXY: (lane, ahead = 4, y = 0) => projectXY(lane * LX, y, w.me.s + ahead),
  hud: () => ({ dist: $('hDist').textContent, clock: $('hClock').textContent, bang: !$('bang').classList.contains('hidden'), telop: telopEl.classList.contains('on') ? telopEl.textContent : '', hint: $('hint').classList.contains('hidden') ? '' : $('hintText').textContent, near: $('near').classList.contains('hidden') ? '' : $('nearTxt').textContent }),
  texts: () => [...document.querySelectorAll('#hud .telop.on, #hud .hint:not(.hidden) span, #hud .bang:not(.hidden) span, #near:not(.hidden) b, #bow:not(.hidden) .bow-grade')].filter(e => e.textContent.trim()).map(e => e.textContent),
  result: () => w.result, finish: home => { w.finish(home) }, showResult,
  sound: () => ({ ...Snd.played }), cam: () => camera.position.toArray(),
  lockCam: v => { camLock = v },
  fx, camera, scene, renderer, dog: () => dog, me: () => me, town: () => town,
  render: () => { syncWorld(0.016); me.mixer.update(0.016); place(0.016); for (let i = 0; i < 40; i++) updateCamera(0.05); look.update(); hud(0); renderer.render(scene, camera) },
}
