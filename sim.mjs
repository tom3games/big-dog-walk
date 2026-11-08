// 遊び方ごとの分布。node sim.mjs [回数]（ブラウザを開かない。音は出ない）
import { runBot } from './js/bots.js'
const N = +process.argv[2] || 24
const kinds = ['skilled', 'clumsy', 'random', 'jumper', 'idle']
const rows = []
const avg = a => a.reduce((x, y) => x + y, 0) / a.length
for (const k of kinds) {
  const rs = []
  for (let s = 1; s <= N; s++) rs.push(runBot(k, s))
  rows.push({
    k, total: Math.round(avg(rs.map(r => r.total))), best: Math.min(...rs.map(r => r.total)), worst: Math.max(...rs.map(r => r.total)),
    home: `${rs.filter(r => r.home).length}/${N}`, time: Math.round(avg(rs.map(r => r.time))), hits: avg(rs.map(r => r.stats.hits)).toFixed(1),
    wraps: avg(rs.map(r => r.stats.wraps)).toFixed(1), yanks: avg(rs.map(r => r.stats.yanks)).toFixed(1), near: avg(rs.map(r => r.stats.near)).toFixed(1),
    chain: avg(rs.map(r => r.stats.bestChain)).toFixed(1), treats: avg(rs.map(r => r.stats.treats)).toFixed(0), rank: avg(rs.map(r => r.rank)).toFixed(2),
    medal: rs.filter(r => r.medal).length, wallet: rs.filter(r => r.wallet).length,
  })
}
console.table(rows)
const by = Object.fromEntries(rows.map(r => [r.k, r.total]))
const ok = by.skilled < by.clumsy && by.clumsy < by.idle && by.skilled < by.jumper && by.skilled < by.random && by.idle >= Math.max(by.random, by.jumper, by.clumsy)
console.log(ok ? 'OK: idle が最悪・skilled が最良' : 'NG: 順番が違う', JSON.stringify(by))
process.exit(ok ? 0 : 1)
