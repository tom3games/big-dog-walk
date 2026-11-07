// 大型犬の散歩。遊びの計算は sim.js（固定60Hz）、ここは three.js の斜め後ろ視点・入力・音・画面
import * as THREE from 'three'
import { Walk, STEP, ROUTE, LIMIT, LEASH, KINDS, BOW_T } from './sim.js?v=1'
import { buildTown } from './town.js?v=1'
import { BigDog } from './dog3d.js?v=1'
import { loadPeople, Person, assets } from './people.js?v=1'
import { setupLook, enableShadows, createFx, look, addBlobShadow } from './look.js?v=1'
import { makeBot } from './bots.js?v=1'
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
try { tutDone = localStorage.getItem('bd_tut') === '1' } catch (e) {}
const t = k => TX[lang][k]
const pickA = a => a[Math.floor(Math.random() * a.length)]

// ---------------------------------------------------------------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2))
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 78)
const lk = setupLook(renderer, scene, { exposure: 1.12, sky: 0xffe2c4, ground: 0x6a5048, hemi: 1.15, sunColor: 0xffc98a, sun: 2.3, sunPos: [-5, 6, -3], fill: 0.55, fillColor: 0xa9b8ff, fillPos: [4, 3, 6] })
const shadow = enableShadows(renderer, lk.sun, { center: [0, 0, 0], radius: 9, mapSize: LOW ? 1024 : 2048, blur: 3 })
const fx = createFx(scene, camera, renderer, { pool: 140 })

function resize() {
  const W = innerWidth, H = innerHeight
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  camera.fov = W / H < 0.5 ? 72 : W / H < 0.75 ? 66 : 50
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()

// 読み込みの進み具合（本物の読み込み数）
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
})
Snd.setMute(muted)
const sfx = (n, o) => Snd.play(n, o)
let audioUp = false
function audioOn() { Snd.init(); if (!audioUp) { audioUp = true; Snd.loop('amb', 'snd/amb_street.mp3', 0.35); Snd.loop('bgm', 'snd/bgm.mp3', 0.14) } }

// ---------------------------------------------------------------- 状態
let mode = 'loading', w = null, town = null, dog = null, me = null, paused = false, slow = 1, acc = 0
let testInput = null, bot = null, seedNext = 1 + Math.floor(Math.random() * 1e6), resultAt = 0, endAt = 0
let camLock = false, camX = 0, camS = 0, telopT = 0, tut = null, stepT = 0, lastBolt = -1, crowT = 8
const neighbors = []
const ropeSegs = []
const tmpV = new THREE.Vector3()
const X = (x, y, s) => tmpV.set(x, y, -s)

// 綱の見た目（赤い布のリード）
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.6 })
const ropeGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6, 1, true); ropeGeo.translate(0, 0.5, 0); ropeGeo.rotateX(Math.PI / 2)
for (let i = 0; i < 13; i++) { const m = new THREE.Mesh(ropeGeo, ropeMat); m.castShadow = true; scene.add(m); ropeSegs.push(m) }
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), ropeMat); scene.add(handle)

// 引きずりの土ぼこり（茶色の粒）
const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(190,160,120,.9)'); g.addColorStop(1, 'rgba(190,160,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
const dust = []
for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); dust.push({ s, life: 0, v: new THREE.Vector3() }) }
function puff(x, y, s, n = 2, sp = 0.8) {
  for (let k = 0; k < n; k++) { const d = dust.find(q => q.life <= 0); if (!d) return; d.life = 0.6 + Math.random() * 0.4; d.s.visible = true; d.s.position.set(x + (Math.random() - 0.5) * 0.4, y, -s + (Math.random() - 0.5) * 0.4); d.v.set((Math.random() - 0.5) * sp, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * sp); d.s.scale.setScalar(0.3) }
}
function stepDust(dt) { for (const d of dust) { if (d.life <= 0) continue; d.life -= dt; if (d.life <= 0) { d.s.visible = false; continue } d.s.position.addScaledVector(d.v, dt); d.s.scale.setScalar(0.3 + (1 - d.life) * 0.9); d.s.material.opacity = Math.min(0.75, d.life) } }

// ---------------------------------------------------------------- 文字（日英）
function applyLang() {
  document.documentElement.lang = lang
  document.querySelectorAll('[data-t]').forEach(el => { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v })
  $('btnMute').textContent = muted ? t('muteOff') : t('muteOn')
  if ($('loadText')) $('loadText').textContent = t('loading')
  $('hHomeL').textContent = t('hud').home; $('hM').textContent = t('hud').m; $('hClockL').textContent = t('hud').clock
  $('howRead').textContent = t('howRead'); $('howBow').textContent = t('howBow'); $('howGoal').textContent = t('howGoal')
  $('lPrivacy').textContent = t('privacy')
  const icons = {
    hold: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#f2e6cf"/><path d="M17 40l4-14 10-6 6 4-4 10" fill="none" stroke="#1d1410" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="34" cy="14" r="4" fill="#1d1410"/><path d="M31 24l12-8" stroke="#c8322a" stroke-width="3" stroke-linecap="round"/><path d="M10 42h14" stroke="#1d1410" stroke-width="3"/></svg>',
    wrap: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#f2e6cf"/><rect x="22" y="6" width="8" height="40" rx="2" fill="#b3aea4" stroke="#1d1410" stroke-width="2"/><path d="M14 30c4-4 20-4 24 0M14 34c4-4 20-4 24 0" fill="none" stroke="#c8322a" stroke-width="3"/><path d="M38 32l8 6" stroke="#c8322a" stroke-width="3" stroke-linecap="round"/></svg>',
    swipe: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="#f2e6cf"/><path d="M10 26h32M14 20l-6 6 6 6M38 20l6 6-6 6" fill="none" stroke="#1d1410" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="36" r="5" fill="#d4302a"/></svg>',
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
  town = buildTown(scene, w, {})
  if (!dog) { dog = new BigDog(); dog.group.scale.setScalar(1.35); scene.add(dog.group); addBlobShadow(dog.body, 1.7, { stretch: 0.6, opacity: 0.35 }) }
  if (!me) { me = new Person('female-e', { face: 0xf3c29b }); scene.add(me.group); addBlobShadow(me.group, 0.9, { opacity: 0.35 }) }
  dog.group.rotation.set(0, Math.PI, 0); dog.wallet.visible = false
  me.group.rotation.set(0, Math.PI, 0); me.lean.rotation.set(0, 0, 0)
  camX = 0; camS = w.me.s; lastBolt = -1
  syncActors(0); place(0)
}

function start(opts = {}) {
  newWalk(opts)
  mode = 'play'; paused = false; slow = 1; acc = 0; resultAt = 0; endAt = 0
  show('hud'); $('telop').className = 'telop'; $('bow').classList.add('hidden'); $('bang').classList.add('hidden')
  tut = (!tutDone && !opts.noTut) ? { step: 'swipe', t: 0, lane0: 0, seenAlert: 0 } : null
  if (tut) hint('swipe', 'swipe')
  window.TM && TM.start()
}
function toTitle() {
  mode = 'title'; show('title'); paused = false
  if (!w) newWalk({ noTut: true })
}

// ---------------------------------------------------------------- 入力（1本指: 押しっぱなし=踏ん張る／左右になぞる=よける／光る柱をタップ=巻く）
const ptr = { id: null, x0: 0, y0: 0, t0: 0, lane0: 0, mode: null, x: 0 }
let holdKey = false, laneKey = 0
const view = $('view')
function poleAt(cx, cy) {
  if (!w) return null
  let best = null, bd = 1e9
  for (const p of w.props) {
    if (!p.wrap || !w.canWrap(p)) continue
    const a = projectXY(p.x, 0.3, p.s), b = projectXY(p.x, 2.6, p.s)
    if (!a || !b) continue
    // 柱の縦の線分までの距離
    const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((cx - a.x) * vx + (cy - a.y) * vy) / L2))
    const d = Math.hypot(cx - (a.x + vx * u), cy - (a.y + vy * u))
    if (d < bd) { bd = d; best = p }
  }
  return bd < Math.max(56, innerWidth * 0.14) ? best : null
}
let pendTap = null, pendBow = false
view.addEventListener('pointerdown', e => {
  if (mode !== 'play') return
  e.preventDefault(); audioOn()
  if (w.phase === 'bow') { pendBow = true; return }
  const p = poleAt(e.clientX, e.clientY)
  if (p) { pendTap = p.id; return }
  ptr.id = e.pointerId; ptr.x0 = ptr.x = e.clientX; ptr.y0 = e.clientY; ptr.t0 = performance.now(); ptr.ts0 = e.timeStamp; ptr.lane0 = w.me.lane; ptr.mode = null
  try { view.setPointerCapture(e.pointerId) } catch (er) {}
})
view.addEventListener('pointermove', e => {
  if (e.pointerId !== ptr.id) return
  ptr.x = e.clientX
  const dx = e.clientX - ptr.x0
  if (!ptr.mode && Math.abs(dx) > 14 && e.timeStamp - ptr.ts0 < 170) ptr.mode = 'swipe'
  if (ptr.mode || Math.abs(dx) > 14) w.me.lane = Math.max(-2.7, Math.min(2.7, ptr.lane0 + dx / innerWidth * 7.5))
})
const ptrEnd = e => { if (e.pointerId !== ptr.id) return; ptr.id = null; ptr.mode = null }
view.addEventListener('pointerup', ptrEnd); view.addEventListener('pointercancel', ptrEnd)
const holding = () => holdKey || (ptr.id != null && ptr.mode !== 'swipe' && performance.now() - ptr.t0 > 120)
addEventListener('keydown', e => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
  audioOn()
  if (mode === 'play') {
    if (e.code === 'Space' || e.code === 'ArrowDown') { if (w.phase === 'bow') pendBow = true; else holdKey = true }
    if (e.code === 'ArrowLeft') laneKey = -1
    if (e.code === 'ArrowRight') laneKey = 1
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') { const r = w.reachable().sort((a, b) => Math.hypot(a.x - w.me.x, a.s - w.me.s) - Math.hypot(b.x - w.me.x, b.s - w.me.s)); if (r[0]) pendTap = r[0].id }
  } else if (mode === 'result' && (e.code === 'Enter' || e.code === 'Space')) start()
})
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowDown') holdKey = false; if ((e.code === 'ArrowLeft' && laneKey < 0) || (e.code === 'ArrowRight' && laneKey > 0)) laneKey = 0 })
addEventListener('blur', () => { holdKey = false; laneKey = 0; ptr.id = null })

function gather() {
  if (bot) return bot(w)
  if (testInput) { const i = { ...testInput }; if (testInput.tapOnce != null) { i.tap = testInput.tapOnce; testInput.tapOnce = null } if (testInput.bowOnce) { i.bowTap = true; testInput.bowOnce = false } return i }
  if (laneKey) w.me.lane = Math.max(-2.7, Math.min(2.7, w.me.lane + laneKey * 0.07))
  const i = { hold: holding(), lane: null, tap: pendTap, bowTap: pendBow }
  pendTap = null; pendBow = false
  return i
}

// ---------------------------------------------------------------- 画面座標
function projectXY(x, y, s) {
  const v = new THREE.Vector3(x, y, -s).project(camera)
  if (v.z > 1) return null
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }
}

// ---------------------------------------------------------------- 出来事 → 演出・音
const telopEl = $('telop')
function telop(text, red = false, sec = 1.5) {
  if (tut && $('hint').classList.contains('hidden') === false && tut.step !== 'done') return
  telopEl.textContent = text; telopEl.className = 'telop on' + (red ? ' red' : ''); telopT = sec
}
function hint(kind, key, at) {
  const h = $('hint'); h.className = 'hint ' + kind; $('hintText').textContent = t('tut')[key]
  if (at) { h.classList.add('at'); h.style.left = at.x + 'px'; h.style.top = at.y + 'px' } else { h.style.left = ''; h.style.top = '' }
}
function hideHint() { $('hint').className = 'hint hidden' }
const T = () => t('telop')
function onEvents() {
  for (const e of w.ev) {
    switch (e.k) {
      case 'alert': sfx('bark', { vol: 0.9 }); popBang(e.id); if (tut && !tut.seenAlert) tutAlert(e); break
      case 'bolt': sfx('burst', { vol: 0.9 }); sfx('swish', { vol: 0.6 }); fx.shake(0.012, 0.3); lastBolt = e.id; break
      case 'trip': sfx('thud', { vol: 1 }); sfx('scrape', { vol: 0.8 }); fx.moment(X(w.me.x, 0.3, w.me.s).clone(), { burst: { count: 14, color: 0xc8a070, speed: 1.2, size: 0.25 }, shake: [0.03, 0.35], zoom: [0.06, 0.4], hitstop: 90 }); me.setExpr('busted'); telop(pickA(e.why === 'grip' ? T().grip : T().trip)); break
      case 'skate': sfx('wood', { vol: 0.8 }); telop(pickA(T().skate)); me.setExpr('panic'); break
      case 'break': {
        const p = w.props[e.p], it = town.props.get(e.p)
        const kind = e.kind
        if (kind === 'pots') sfx('pot', { vol: 1 }), sfx('pot', { vol: 0.7, delay: 0.12 })
        else if (kind === 'bikes') sfx('metal', { vol: 1 }), sfx('clang', { vol: 0.6, delay: 0.18 }), sfx('metal', { vol: 0.7, delay: 0.32 })
        else if (kind === 'laundry') sfx('cloth', { vol: 1 }), sfx('wood', { vol: 0.5 })
        else if (kind === 'skate') { sfx('wood', { vol: 1 }); sfx('thud'); telop(pickA(T().skateCrash), true) }
        if (it) it.breakT = 0.001
        fx.moment(X(p.x, 0.6, p.s).clone(), { burst: { count: 22, color: kind === 'pots' ? 0xc8784a : 0xe0e0e0, speed: 2, size: 0.18 }, shake: [0.03, 0.3], zoom: [0.05, 0.3], hitstop: 70 })
        if (kind === 'laundry' && w.dog.shirt) telop(T().shirt)
        break
      }
      case 'bonk': sfx('clang', { vol: 0.9 }); sfx('thud', { vol: 0.8 }); telop(pickA(T().bonk)); fx.shake(0.03, 0.3); break
      case 'reach': {
        const ev = w.events[e.id], a = town.actors[e.id]
        if (e.kind === 'cat') sfx('meow')
        else if (e.kind === 'pigeon') { sfx('cloth'); sfx('cloth', { delay: 0.1, rate: 1.3 }); sfx('swish') }
        else if (e.kind === 'smalldog') { sfx('bark', { rate: 1.9, vol: 0.8 }); sfx('bark', { rate: 2.0, vol: 0.7, delay: 0.2 }); sfx('pot', { delay: 0.25, rate: 1.6, vol: 0.6 }) }
        else if (e.kind === 'yakiimo') { sfx('metal'); sfx('clang', { delay: 0.15 }) }
        else if (e.kind === 'jogger') { sfx('cloth'); sfx('thud', { delay: 0.2 }) }
        else if (e.kind === 'wedding') { sfx('clang'); sfx('cloth', { delay: 0.1 }); sfx('thud', { delay: 0.3 }) }
        if (a) a.hitT = 0.001
        fx.moment(X(ev.tx, 1, ev.ts).clone(), { burst: { count: 26, color: 0xfff0a0, speed: 2.2 }, shake: [0.035, 0.35], zoom: [0.08, 0.4], hitstop: 110 })
        telop(T().reach[e.kind], true, 1.8); dog.setExpr('happy')
        break
      }
      case 'calm': { const ev = w.events[e.id]; if (!KINDS[ev.kind].good) { telop(pickA(T().stopped)); dog.setExpr('sad'); sfx('whine', { vol: 0.6 }) } const a = town.actors[e.id]; if (a) a.leaveT = 0.001; break }
      case 'wrap': sfx('leash'); sfx('clang', { vol: 0.5, rate: 1.3 }); telop(pickA(T().wrap)); if (tut && tut.step === 'wrap') tutNext(); break
      case 'unwrap': sfx('leash', { vol: 0.6, rate: 1.2 }); break
      case 'wallet': sfx('coin'); sfx('ding', { delay: 0.3 }); telop(T().reach.wallet); dog.wallet.visible = true; break
      case 'medal': sfx('whistle'); sfx('applause', { vol: 0.7 }); telop(T().medal, false, 2); break
      case 'bowStart': startBowUI(); break
      case 'bowGrade': gradeBowUI(e.grade); break
      case 'end': endT(e.home); break
    }
  }
  w.ev.length = 0
}
function popBang(id) {
  const ev = w.events[id]
  $('bangKind').textContent = t('kinds')[ev.kind]
  const b = $('bang'); b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''
}

// ---------------------------------------------------------------- チュートリアル（初回だけ。遊びの中で1つずつ）
function tutAlert(e) {
  tut.seenAlert++
  if (tut.seenAlert === 1) { tut.step = 'hold'; slow = 0.12; hint('hold', 'hold') }
  else if (tut.seenAlert === 2) {
    tut.step = 'wrap'; slow = 0.1
    const r = w.reachable()
    if (r.length) { const q = projectXY(r[0].x, 1.6, r[0].s); hint('tap at', 'wrap', q) } else hint('tap', 'wrap')
  }
}
function tutNext() { slow = 1; hideHint(); if (tut.step === 'wrap') { tut.step = 'done'; tutDone = true; try { localStorage.setItem('bd_tut', '1') } catch (e) {} } else tut.step = 'wait' }
function tutTick(dt) {
  if (!tut || tut.step === 'done') return
  tut.t += dt
  if (tut.step === 'swipe' && (Math.abs(w.me.lane) > 0.8 || tut.t > 5)) { tut.step = 'wait'; hideHint() }
  if (tut.step === 'hold') { tut.ht = (tut.ht || 0) + dt; if (holding() || bot || tut.ht > 7) tutNext() }
  if (tut.step === 'wrap') {
    tut.wt = (tut.wt || 0) + dt
    const r = w.reachable(); if (r.length) { const q = projectXY(r[0].x, 1.6, r[0].s); if (q) { const h = $('hint'); h.classList.add('at'); h.style.left = q.x + 'px'; h.style.top = q.y + 'px' } }
    if (tut.wt > 8 || bot) tutNext()
  }
}

// ---------------------------------------------------------------- お辞儀の画面
function arcPath(a0, a1) {   // 分度器: 0 度=真上、90 度=真横（右）。中心 (20,120) 半径 100
  const P = a => [20 + 100 * Math.sin(a * Math.PI / 180), 120 - 100 * Math.cos(a * Math.PI / 180)]
  const [x0, y0] = P(a0), [x1, y1] = P(a1)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A100 100 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}
document.querySelector('#bowSvg path').setAttribute('d', arcPath(0, 90)); $('bowGood').setAttribute('d', arcPath(52, 76)); $('bowDeep').setAttribute('d', arcPath(76, 90))
$('bowTicks').innerHTML = [0, 15, 30, 45, 60, 75, 90].map(a => { const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180); return `<line x1="${20 + 90 * s}" y1="${120 - 90 * c}" x2="${20 + 100 * s}" y2="${120 - 100 * c}"/>` }).join('')
function startBowUI() {
  const items = w.bow.items, who = t('who')
  const names = [...new Set(items.map(i => who[i.who]))]
  $('bowWho').textContent = names.length > 1 ? (lang === 'ja' ? `${names[0]} ほか${names.length - 1}人` : `${names[0]} and ${names.length - 1} more`) : names[0]
  $('bowGradeL').textContent = tut && !tut.bowSeen ? t('tut').bow : ''
  if (tut) tut.bowSeen = true
  $('bow').classList.remove('hidden'); $('bang').classList.add('hidden'); if (telopT > 0.5) telopT = 0.5
  sfx('cloth', { vol: 0.6 })
  me.setExpr('panic')
  // 謝る相手を前に並べる
  for (const n of neighbors) scene.remove(n.group); neighbors.length = 0
  const files = { suzuki: 'female-d', sato: 'male-d', madam: 'female-d', imo: 'male-b', jogger: 'male-f', bride: 'female-c', tanaka: 'male-c', sato2: 'male-f', yamada: 'female-b', kid: 'male-b', granny: 'female-f' }
  names.slice(0, 3).forEach((nm, i) => {
    const key = items.find(it => who[it.who] === nm).who
    const f = files[key] || 'female-e'
    if (!assets.src[f]) return
    const p = new Person(f, { anim: 'emote-no', tint: key === 'bride' ? 0xffffff : undefined })
    p.group.position.set(w.me.x + (i - (Math.min(3, names.length) - 1) / 2) * 0.95, 0, -(w.me.s + 1.7)); p.group.rotation.y = 0
    scene.add(p.group); neighbors.push(p)
  })
}
function gradeBowUI(g) {
  $('bowGradeL').textContent = t('bowGrade')[g] + '  ' + t('bowSay')[g]
  if (g === 'deep') { sfx('bowgood'); sfx('ding', { delay: 0.2, vol: 0.6 }); me.setExpr('relief'); for (const n of neighbors) n.play('emote-yes') }
  else if (g === 'good') { sfx('bowgood', { rate: 0.9 }); me.setExpr('normal'); for (const n of neighbors) n.play('idle') }
  else { sfx('bowbad'); me.setExpr('busted') }
  setTimeout(() => { $('bow').classList.add('hidden'); for (const n of neighbors) scene.remove(n.group); neighbors.length = 0; me.setExpr('normal'); dog.setExpr('normal') }, 1150)
}

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
const photoCam = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
function dogPhoto() {
  dog.setExpr('happy'); dog.pose(0, { speed: 0, ears: 0.15, happy: 1, sit: 0, look: 0 })
  dog.group.updateMatrixWorld(true)
  const hp = new THREE.Vector3(); dog.head.getWorldPosition(hp)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(dog.group.quaternion)
  photoCam.position.copy(hp).addScaledVector(fwd, 2.1).add(new THREE.Vector3(0.35, 0.12, 0)); photoCam.lookAt(hp.x, hp.y - 0.12, hp.z)
  photoLight.position.copy(photoCam.position).add(new THREE.Vector3(0, 0.6, 0)); photoLight.intensity = 6
  const hidden = []
  for (const s of ropeSegs) { hidden.push([s, s.visible]); s.visible = false }
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
  // 回覧板（木の板と金具）
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#b98552'); g.addColorStop(1, '#8e5e34'); x.fillStyle = g; x.fillRect(0, 0, W, H)
  x.strokeStyle = 'rgba(70,40,20,.25)'; x.lineWidth = 2; for (let i = 0; i < 26; i++) { x.beginPath(); const y0 = Math.random() * H; x.moveTo(0, y0); x.bezierCurveTo(W * 0.3, y0 + 20, W * 0.6, y0 - 20, W, y0 + 8); x.stroke() }
  x.fillStyle = '#fbf7ee'; x.save(); x.translate(W / 2, 70); x.rotate(-0.008); x.fillRect(-W / 2 + 36, 0, W - 72, H - 110); x.restore()
  x.fillStyle = '#c4c7cc'; x.fillRect(W / 2 - 120, 28, 240, 62); x.fillStyle = '#9aa0a8'; x.fillRect(W / 2 - 120, 76, 240, 14); x.fillStyle = '#5a5f66'; x.beginPath(); x.arc(W / 2, 58, 12, 0, 7); x.fill()
  x.fillStyle = '#2a2520'; x.font = `22px ${gothic}`; x.textAlign = 'left'; x.fillText(lang === 'ja' ? '回覧板' : 'NEIGHBORHOOD BOARD', 60, 128)
  // 犬の写真（テープで貼る）
  try {
    const ph = dogPhoto(); x.save(); x.translate(W - 210, 112); x.rotate(0.06)
    x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 10; x.fillRect(-10, -10, 170, 196); x.shadowBlur = 0
    x.drawImage(ph, 0, 0, 150, 150); x.fillStyle = '#2a2520'; x.font = `19px ${hand}`; x.textAlign = 'center'; x.fillText(t('dogName') + (lang === 'ja' ? '（ごきげん）' : ' (happy)'), 75, 176)
    x.fillStyle = 'rgba(240,220,150,.75)'; x.fillRect(35, -22, 80, 24); x.restore()
  } catch (e) {}
  // 見出し
  x.textAlign = 'left'; x.fillStyle = '#1d1410'; x.font = `${lang === 'ja' ? 42 : 34}px ${hand}`; x.fillText(t('listTitle'), 60, 196)
  x.font = `20px ${gothic}`; x.fillStyle = r.home ? '#1f7a4c' : '#d4302a'; x.fillText(r.home ? t('homeOk') + '（' + t('left')(fmtTime(Math.max(0, LIMIT - r.time))) + '）' : t('homeLate'), 62, 234)
  // 行
  const rows = r.list.filter(i => !i.good || i.item === 'wallet')
  let y = 352
  if (!rows.length) { x.fillStyle = '#1f7a4c'; x.font = `34px ${hand}`; x.fillText(t('listNone'), 70, y + 30) }
  const maxRows = rows.length > 6 ? 5 : 6
  rows.slice(0, maxRows).forEach((it, i) => {
    x.strokeStyle = 'rgba(29,79,156,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(60, y + 30); x.lineTo(W - 60, y + 30); x.stroke()
    x.fillStyle = it.good ? '#1f7a4c' : '#1d1410'; x.font = `24px ${hand}`; x.textAlign = 'left'
    const who = t('who')[it.who] || it.who, item = t('item')[it.item] || it.item
    x.fillText(`${i + 1}. ${who}`, 62, y); x.font = `20px ${hand}`; x.fillStyle = '#5a5048'; x.fillText(item, 92, y + 25)
    x.textAlign = 'right'; x.font = `25px ${gothic}`; x.fillStyle = it.cost < 0 ? '#1f7a4c' : '#1d1410'
    x.fillText((it.cost < 0 ? '+' : '') + '¥' + Math.abs(it.cost).toLocaleString(), W - 64, y)
    if (it.grade) { x.font = `17px ${gothic}`; x.fillStyle = it.grade === 'deep' ? '#d4302a' : '#7a6e62'; x.fillText(t('bowGrade')[it.grade] + (it.base && it.base !== it.cost ? `  ¥${it.base.toLocaleString()}` : ''), W - 64, y + 22) }
    y += 54
  })
  if (rows.length > maxRows) { x.textAlign = 'left'; x.font = `20px ${hand}`; x.fillStyle = '#5a5048'; x.fillText(lang === 'ja' ? `ほか ${rows.length - maxRows} 件` : `${rows.length - maxRows} more`, 70, y + 4) }
  // 合計
  y = 742
  x.strokeStyle = '#1d1410'; x.lineWidth = 3; x.beginPath(); x.moveTo(60, y - 34); x.lineTo(W - 60, y - 34); x.stroke()
  x.textAlign = 'left'; x.fillStyle = '#1d1410'; x.font = `30px ${hand}`; x.fillText(t('total'), 64, y + 6)
  x.textAlign = 'right'; x.font = `46px ${gothic}`; x.fillStyle = r.total > 0 ? '#d4302a' : '#1f7a4c'; x.fillText((r.total < 0 ? '+' : '') + '¥' + Math.abs(r.total).toLocaleString(), W - 64, y + 12)
  // メダル・お礼の小さな札（右下）
  let nx = W - 64; x.font = `18px ${gothic}`
  for (const [on, label, col] of [[r.medal, t('medalNote'), '#c99a1a'], [r.wallet, t('walletNote'), '#1f7a4c']]) { if (!on) continue; const tw = x.measureText(label).width + 22; nx -= tw; x.fillStyle = col; x.fillRect(nx, y + 40, tw, 30); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(label, nx + 11, y + 62); nx -= 10 }
  // 判定のハンコ（左下）
  const rank = t('ranks')[r.rank]
  x.font = `${rank.length > 9 ? 22 : 27}px ${gothic}`
  const rw = Math.max(110, x.measureText(rank).width / 2 + 34)
  x.save(); x.translate(64 + rw, H - 92); x.rotate(-0.1)
  x.strokeStyle = '#d4302a'; x.lineWidth = 6; x.globalAlpha = 0.88; x.beginPath(); x.ellipse(0, 0, rw, 50, 0, 0, 7); x.stroke()
  x.fillStyle = '#d4302a'; x.textAlign = 'center'; x.fillText(rank, 0, 9); x.restore(); x.globalAlpha = 1
}
const fmtTime = s => { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, '0')}` }

// ---------------------------------------------------------------- 相手の見た目を毎フレーム
function syncActors(dt) {
  if (!town) return
  for (const ev of w.events) {
    let a = town.actors[ev.id]
    if (!a && ev.at - w.dog.s < 45) a = town.makeActor(ev, assets.ready || Object.keys(assets.src).length > 3 ? Person : null)
    if (!a) continue
    a.t = (a.t || 0) + dt
    const active = ev.st === 'alert' || ev.st === 'bolt'
    a.g.position.set(ev.tx, 0, -ev.ts)
    const P = a.parts
    if (P.madam) P.madam.mixer.update(dt)
    if (P.imo) P.imo.mixer.update(dt)
    if (P.jog) P.jog.mixer.update(dt * 1.2)
    if (P.bride) { P.bride.mixer.update(dt); P.groom.mixer.update(dt); P.ph.mixer.update(dt) }
    if (P.granny) P.granny.mixer.update(dt)
    if (P.runners) for (const r of P.runners) r.mixer.update(dt * 1.1)
    if (a.hitT) a.hitT += dt
    if (a.leaveT) a.leaveT += dt
    if (ev.kind === 'cat') {
      const c = P.cat
      if (a.hitT) { c.position.y = 1.21 + Math.min(1.6, a.hitT * 3); c.position.x = -Math.sign(ev.tx) * -Math.min(1.5, a.hitT * 2); c.rotation.z = a.hitT * 6 }
      else if (a.leaveT) { c.position.z = -a.leaveT * 3; c.position.y = 1.21 + Math.abs(Math.sin(a.leaveT * 12)) * 0.15 }
      else { c.position.y = 1.21 + (active ? Math.abs(Math.sin(a.t * 3)) * 0.04 : 0); c.rotation.y = -Math.sign(ev.tx) * Math.PI / 2 + Math.sin(a.t * 0.8) * 0.3 }
    }
    if (ev.kind === 'pigeon') {
      const fly = a.hitT || a.leaveT || (ev.st === 'bolt' && Math.hypot(w.dog.x - ev.tx, w.dog.s - ev.ts) < 3.5) ? (a.flyT = (a.flyT || 0) + dt) : 0
      P.birds.forEach((b, i) => {
        if (fly) { b.position.y = fly * (1.6 + i * 0.3); b.position.x += Math.sin(i * 2) * dt * 2; b.userData.wings.forEach((wg, k) => wg.rotation.z = Math.sin(a.t * 40 + k) * 0.8) }
        else { b.position.y = 0; b.rotation.y += Math.sin(a.t * 3 + i) * dt; b.children[2].position.y = 0.26 + Math.sin(a.t * 8 + i * 1.7) * 0.03 }
      })
    }
    if (ev.kind === 'yakiimo') {
      P.smoke.forEach((s, i) => { const k = (a.t * 0.4 + i / 4) % 1; s.position.y = 2.2 + k * 1.6; s.material.opacity = 0.45 * (1 - k); s.scale.setScalar(0.6 + k * 1.4) })
      if (a.leaveT) P.truck.position.z = -a.leaveT * a.leaveT * 2
      if (a.hitT) P.oven.rotation.z = Math.min(1.2, a.hitT * 4) * -Math.sign(ev.tx)
    }
    if (ev.kind === 'smalldog' && P.chi) {
      P.chi.position.x = -Math.sign(ev.tx) * 0.5 + Math.sin(a.t * 40) * (active ? 0.01 : 0.004)
      if (a.hitT && P.bag) { P.bag.position.y = 0.55 + Math.min(0.6, a.hitT * 2) - Math.max(0, a.hitT - 0.3) * 3; P.bag.rotation.z = a.hitT * 5; if (P.madam) P.madam.play('emote-no') }
    }
    if (ev.kind === 'jogger' && P.jog) {
      if (w.stranger && w.stranger.id === ev.id) { P.jog.group.rotation.y += dt * 8; P.jog.play('idle') }
      else if (a.hitT) P.jog.play('idle')
    }
    if (ev.kind === 'wedding' && P.bride) {
      if (a.hitT) { P.bride.play('fall'); P.groom.play('fall'); P.ph.play('emote-no'); P.set.rotation.z = 0 }
    }
    if (ev.kind === 'wallet') {
      if (P.glint) { P.glint.material.opacity = ev.reached ? 0 : 0.6 + Math.sin(a.t * 6) * 0.4; P.glint.scale.setScalar(0.4 + Math.sin(a.t * 6) * 0.12) }
      if (ev.reached && P.granny) { P.granny.group.visible = true; P.granny.play('emote-yes') }
    }
    if (ev.kind === 'marathon') {
      P.arch.visible = ev.at - w.dog.s < 40
      if (P.runners.length) for (const [i, r] of P.runners.entries()) { if (active) r.group.position.z = (r.group.position.z || 0) + dt * (ev.st === 'bolt' ? 0 : 0) ; r.group.visible = ev.st !== 'wait' || ev.at - w.dog.s < 12 }
      if (ev.reached) P.tape.visible = false
    }
  }
}

// 壊れた物の動き
function stepProps(dt) {
  for (const [id, it] of town.props) {
    const p = it.p
    if (it.breakT) {
      it.breakT += dt; const k = Math.min(1, it.breakT * 3)
      if (it.kind === 'pots') it.parts.forEach((pg, i) => { pg.rotation.z = k * (1.2 + i * 0.4) * (i % 2 ? 1 : -1); pg.position.y = Math.max(-0.05, Math.sin(k * Math.PI) * 0.4 - (k > 0.9 ? 0.1 : 0)); pg.position.x = (i - 1) * 0.25 * k + Math.sign(p.x) * -0.3 * k })
      if (it.kind === 'bikes') it.parts.forEach((b, i) => { const kk = Math.max(0, Math.min(1, (it.breakT - i * 0.12) * 4)); b.rotation.x = -kk * 1.45 })
      if (it.kind === 'laundry') { it.g.rotation.z = -Math.sign(p.x) * k * 1.3; if (w.dog.shirt && it.parts[1]) it.parts[1].visible = false }
      if (it.kind === 'skate' && it.board) { it.board.position.y = Math.sin(k * Math.PI) * 1.2; it.board.rotation.x = k * 9 }
    }
    if (it.kind === 'skate' && p.ridden && !p.broken && it.board) {   // 乗っている間は足の下
      it.g.position.set(w.me.x, 0, -w.me.s); it.board.rotation.y = Math.atan2(w.me.vx, w.me.vs) * -1
    }
    if (it.ring) {
      const near = Math.abs(p.s - w.me.s) < 14
      const ok = near && mode === 'play' && w.phase === 'play' && w.canWrap(p) && !w.wrap
      const pul = 0.55 + Math.sin(performance.now() / 160) * 0.35
      it.ring.material.opacity = ok ? pul : 0
      it.ring.scale.setScalar(ok ? 1 + Math.sin(performance.now() / 160) * 0.12 : 1)
      if (it.glowMat) { it.glowMat.emissive.setHex(ok ? 0xffa21a : 0x000000); it.glowMat.emissiveIntensity = ok ? 0.45 + pul * 0.35 : 0 }
      it.coil.visible = !!(w.wrap && w.wrap.prop === p)
    }
  }
}

// ---------------------------------------------------------------- 毎フレームの置き直し
let walkPhase = 0
function place(dt) {
  const d = w.dog, m = w.me
  // 犬
  const dsp = Math.hypot(d.vx, d.vs)
  const heading = d.hd || 0
  dog.group.position.set(d.x, 0, -d.s)
  dog.group.rotation.y = Math.PI - heading
  const ev = d.ev
  let lookRel = 0
  if (ev && (d.st === 'alert' || d.st === 'bolt')) { lookRel = Math.atan2(ev.tx - d.x, ev.ts - d.s) - heading; while (lookRel > Math.PI) lookRel -= Math.PI * 2; while (lookRel < -Math.PI) lookRel += Math.PI * 2 }
  const strainNow = !!w.wrap && (d.st === 'bolt')
  dog.pose(dt, { speed: dsp, ears: d.ears, look: -lookRel, sit: d.sit, happy: d.happy > 0.3 || d.st === 'proud', strain: strainNow, shirt: d.shirt })
  if (mode === 'play' && w.phase === 'play') {
    if (d.st === 'alert') dog.setExpr('alert')
    else if (d.st === 'bolt') dog.setExpr(strainNow ? 'strain' : 'alert')
    else if (d.st === 'proud') dog.setExpr('happy')
    else if (d.sit > 0.5) dog.setExpr('sad')
    else if (dog.expr !== 'happy' || d.happy < 0.3) dog.setExpr(d.happy > 0.3 ? 'happy' : 'normal')
  }
  // 自分
  const msp = Math.hypot(m.vx, m.vs)
  const toDog = Math.atan2(d.x - m.x, d.s - m.s)
  me.group.position.set(m.x, 0, -m.s)
  let ry = Math.PI - toDog, lx = 0, py = 0
  if (m.st === 'dragged') {
    if (m.skate) { me.play('holding-both', 0.15); lx = -0.25; py = 0.12; me.setExpr('panic') }
    else { me.play('holding-both', 0.1); lx = 1.38; py = 0.18; if (me.face && me.face.expr !== 'busted') me.setExpr('busted') }
    if (!m.skate && msp > 1) { puff(m.x + (Math.random() - 0.5) * 0.3, 0.2, m.s + 0.75, 2, 1.2); stepT += dt; if (stepT > 0.28) { stepT = 0; sfx('scrape', { vol: Math.min(1, msp / 5) }) } }
  } else if (m.st === 'getup') { me.play('crouch', 0.15); lx = 0.3 }
  else if (w.phase === 'bow') { me.play('idle', 0.2); ry = Math.PI }
  else if (m.st === 'hold') { me.play('holding-both', 0.15); lx = -0.42; me.setExpr(w.taut ? 'strain' : 'normal'); if (msp > 0.3) puff(m.x, 0.05, m.s + 0.1, 1, 0.3) }
  else if (w.phase === 'end' && w.result && w.result.home) { me.play('emote-yes', 0.3); ry = Math.PI }
  else { me.play(msp > 3.2 ? 'sprint' : msp > 0.3 ? 'walk' : 'idle', 0.2, msp > 3.2 ? 1 : Math.max(0.7, msp / 2)); if (me.face && me.face.expr === 'strain') me.setExpr('normal'); if (msp > 0.5) { stepT += dt * msp; if (stepT > 1.1) { stepT = 0; sfx('step', { vol: 0.25 }) } } }
  me.group.rotation.y = ry
  me.lean.rotation.x = lx
  me.lean.position.y = py
  // お辞儀（胴の骨を前へ）
  const tb = me.bones.torso
  if (tb) tb.rotation.x = w.phase === 'bow' ? m.bowA * Math.PI / 180 * 0.95 : 0
  if (me.bones.head) me.bones.head.rotation.x = w.phase === 'bow' ? m.bowA * Math.PI / 180 * 0.15 : 0
  // 綱
  const R = w.rope
  for (let i = 0; i < ropeSegs.length; i++) {
    const a = R[i], b = R[i + 1], s = ropeSegs[i]
    s.position.set(a.x, a.y, -a.s); const L = Math.hypot(b.x - a.x, b.y - a.y, b.s - a.s) || 0.001
    s.scale.set(1, 1, L); s.lookAt(b.x, b.y, -b.s)
  }
  handle.position.set(R[0].x, R[0].y, -R[0].s)
  for (const n of neighbors) n.mixer.update(dt)
}

// ---------------------------------------------------------------- カメラ
const camPos = new THREE.Vector3(0, 6, 6), camLook = new THREE.Vector3()
function updateCamera(dt) {
  const d = w.dog, m = w.me
  if (mode === 'title' || mode === 'how' || mode === 'loading') {
    const tt = performance.now() / 1000
    camPos.set(Math.sin(tt * 0.15) * 1.3 + 0.9, 2.3, -(m.s - 4.6))
    camera.position.copy(camPos); camera.lookAt(d.x * 0.5, 0.9, -(m.s + 2.2)); return
  }
  const k = 1 - Math.exp(-dt * 3.2)
  let tx = Math.max(-1.6, Math.min(1.6, (m.x + d.x) / 2)), ts = m.s
  const ev = d.ev
  let px, py, pz, lx, ly, lz
  if (w.phase === 'bow') {
    const side = m.x > 0 ? -1 : 1; px = Math.max(-3.1, Math.min(3.1, m.x + side * 3.6)); py = 1.9; pz = -(m.s - 1.2); lx = m.x; ly = 0.85; lz = -(m.s + 0.9)
  } else {
    // 届く柱があれば、その柱が画面から外れないように寄せる。なければ相手の方へ
    const rp = mode === 'play' && !w.wrap ? w.reachable().sort((a, b) => a.s - b.s)[0] : null
    if (rp) tx = tx * 0.5 + rp.x * 0.32
    else if (ev && (d.st === 'alert' || d.st === 'bolt')) tx = tx * 0.6 + ev.tx * 0.25
    const dr = m.st === 'dragged' ? 1 : 0
    px = tx * 0.6; py = 5.6 - dr * 0.9; pz = -(ts - 5.4 + dr * 0.6)
    lx = tx; ly = 0.3; lz = -(ts + 5.6)
  }
  camX += (px - camX) * k; camS += (pz - camS) * k
  camPos.set(camX, camPos.y + (py - camPos.y) * k, camS)
  camLook.lerp(new THREE.Vector3(lx, ly, lz), k)
  camera.position.copy(camPos); camera.lookAt(camLook)
}

// ---------------------------------------------------------------- HUD
function hud(dt) {
  const left = Math.max(0, Math.round(ROUTE - w.dog.s))
  $('hDist').textContent = left
  const rem = Math.max(0, LIMIT - w.t)
  $('hClock').textContent = fmtTime(Math.ceil(rem))
  $('hClock').parentElement.classList.toggle('late', rem < 30)
  // 「！」を相手の頭上に
  const ev = w.dog.ev, b = $('bang')
  if (ev && (ev.st === 'alert' || ev.st === 'bolt') && w.phase === 'play') {
    const yy = ev.kind === 'cat' ? 1.8 : ev.kind === 'yakiimo' ? 2.4 : ev.kind === 'pigeon' ? 0.8 : ev.kind === 'wallet' ? 1.2 : 1.9
    const q = projectXY(ev.tx, yy, ev.ts)
    if (q) { b.classList.remove('hidden'); b.style.left = Math.max(48, Math.min(innerWidth - 48, q.x)) + 'px'; b.style.top = Math.max(110, Math.min(innerHeight - 40, q.y)) + 'px' }
  } else b.classList.add('hidden')
  if (telopT > 0) { telopT -= dt; if (telopT <= 0) telopEl.className = 'telop' }
  // お辞儀の針
  if (w.phase === 'bow') $('bowNeedle').setAttribute('transform', `rotate(${w.me.bowA.toFixed(1)} 20 120)`)
}

// ---------------------------------------------------------------- ループ（遊びは固定60Hz、演出は実時間）
let last = performance.now()
function frame(now) {
  requestAnimationFrame(frame)
  const rdt = Math.min(0.05, (now - last) / 1000); last = now
  if (!w || mode === 'loading') { renderer.render(scene, camera); return }
  const vdt = fx.update(rdt)
  if (mode === 'play' && !paused) {
    if (tut) tutTick(rdt)
    if (vdt > 0) {
      acc += rdt * slow
      let n = 0
      while (acc >= STEP && n < 6) { w.step(gather()); onEvents(); acc -= STEP; n++ }
      if (n === 6) acc = 0
    }
    if (w.phase === 'end') {
      if (!endAt) endAt = now
      if (now - endAt > 1600 && mode === 'play') showResult()
    }
    crowT -= rdt; if (crowT < 0) { crowT = 14 + Math.random() * 12; sfx('crow', { vol: 0.35 }) }
  }
  syncActors(rdt * (mode === 'play' ? slow : 1))
  if (town) stepProps(rdt)
  place(mode === 'play' ? rdt * Math.max(0.2, slow) : rdt)
  stepDust(rdt)
  if (!camLock) updateCamera(rdt)
  // 影は自分のまわりだけ
  const sc = new THREE.Vector3(w.me.x, 0, -(w.me.s + 3)), dir = lk.sun.position.clone().sub(lk.sun.target.position).normalize()
  lk.sun.target.position.copy(sc); lk.sun.position.copy(sc).addScaledVector(dir, 36); lk.sun.target.updateMatrixWorld()
  if (scene.userData.sky) scene.userData.sky.position.copy(camera.position)
  if (mode === 'play') hud(rdt)
  me.mixer.update(rdt)
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
setTimeout(() => { const L = $('loading'); if (L && !window.__bdReady) { L.classList.add('done') } }, 12000)
requestAnimationFrame(frame)

// ---------------------------------------------------------------- 検証用の窓口
window.bd = {
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }),
  get w() { return w }, get mode() { return mode }, get lang() { return lang },
  start: o => start({ noTut: true, ...o }), startTut: o => { tutDone = false; start(o) },
  dbg: { pause: v => { paused = v ?? !paused }, step: n => { for (let i = 0; i < (n || 1); i++) { w.step(gather()); onEvents() } }, slow: v => { slow = v } },
  input: v => { testInput = v }, bot: (k, seed) => { bot = k ? makeBot(k, seed || 1) : null },
  propXY: id => { const p = w.props[id]; return projectXY(p.x, 1.2, p.s) },
  reachable: () => w.reachable().map(p => ({ id: p.id, kind: p.kind, xy: projectXY(p.x, 1.2, p.s) })),
  hud: () => ({ dist: $('hDist').textContent, clock: $('hClock').textContent, bang: !$('bang').classList.contains('hidden'), telop: telopEl.classList.contains('on') ? telopEl.textContent : '', hint: $('hint').classList.contains('hidden') ? '' : $('hintText').textContent }),
  texts: () => [...document.querySelectorAll('#hud .telop.on, #hud .hint:not(.hidden) span, #hud .bang:not(.hidden) span, #bow:not(.hidden) .bow-grade')].filter(e => e.textContent.trim()).map(e => e.textContent),
  result: () => w.result, finish: home => { w.finish(home) }, showResult,
  sound: () => ({ ...Snd.played }), cam: () => camera.position.toArray(),
  lockCam: v => { camLock = v },
  fx, camera, scene, renderer, dog: () => dog, me: () => me, place: () => { place(0.016); updateCamera(1) },
  render: () => { syncActors(0.016); stepProps(0.016); place(0.016); for (let i = 0; i < 40; i++) updateCamera(0.05); look.update(); hud(0); renderer.render(scene, camera) },
}
