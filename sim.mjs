// 遊び方ごとの分布。node sim.mjs [回数]（ブラウザを開かない。音は出ない）
import { runBot } from './js/bots.js'
const N = +process.argv[2] || 24
const kinds = ['reader', 'slowreader', 'holdread', 'spamwrap', 'random', 'pull', 'idle']
const rows = []
for (const k of kinds) {
  const rs = []
  for (let s = 1; s <= N; s++) rs.push(runBot(k, s))
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
  const total = avg(rs.map(r => r.total)), home = rs.filter(r => r.home).length, bad = (rs.reduce((a, r) => a + r.bad, 0) / N).toFixed(1)
  const rank = (rs.reduce((a, r) => a + r.rank, 0) / N).toFixed(2), time = avg(rs.map(r => r.time))
  const trips = (rs.reduce((a, r) => a + r.stats.trips, 0) / N).toFixed(1), wraps = (rs.reduce((a, r) => a + r.stats.wraps, 0) / N).toFixed(1)
  const best = Math.min(...rs.map(r => r.total)), worst = Math.max(...rs.map(r => r.total))
  rows.push({ k, total, best, worst, home: `${home}/${N}`, bad, rank, time, trips, wraps, medal: rs.filter(r => r.medal).length, wallet: rs.filter(r => r.wallet).length })
}
console.table(rows)
const by = Object.fromEntries(rows.map(r => [r.k, r.total]))
const ok = by.reader < by.spamwrap && by.reader < by.holdread && by.reader < by.random && by.reader < by.pull && by.idle > by.random && by.idle > by.pull && by.idle > by.reader
console.log(ok ? 'OK: idle が最悪・reader が最良' : 'NG: 順番が違う', JSON.stringify(by))
process.exit(ok ? 0 : 1)
