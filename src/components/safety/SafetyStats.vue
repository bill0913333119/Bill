<script setup>
// 統計：分包商評比（報到合規、整改準時、缺失件數）、通報分類、每日趨勢、工安點數排行、吹哨處理結果。
import { computed, onMounted, ref } from 'vue'
import { SOURCE_LABELS, addSiteDays, categoryById, siteDate } from '../../../shared/safety.js'
import * as api from '../../lib/api.js'

const props = defineProps({ project: { type: String, required: true } })

const days = ref(7)
const data = ref(null)
const loading = ref(false)
const error = ref('')
const hover = ref(-1)
const tableView = ref(false)

// 顏色跟著資料來源走，不隨篩選改變（已用 dataviz 驗證器檢查：CVD ΔE 9.2；水綠色對白底 < 3:1，故提供表格檢視）
const SERIES = [
  { id: 'engineer', label: SOURCE_LABELS.engineer, color: 'var(--series-1)' },
  { id: 'worker', label: SOURCE_LABELS.worker, color: 'var(--series-2)' },
  { id: 'whistle', label: SOURCE_LABELS.whistle, color: 'var(--series-3)' },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    const to = siteDate()
    data.value = await api.safetyStats(props.project, addSiteDays(to, -(days.value - 1)), to)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

function setDays(n) {
  days.value = n
  load()
}

const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  const count = (src) => d.categories.filter((c) => c.source === src).reduce((s, c) => s + c.count, 0)
  return [
    { label: '報到人次', value: d.totals.checkins },
    { label: '報到人數', value: d.totals.people },
    { label: '報到被擋', value: d.totals.blocked },
    { label: '現場通報', value: count('worker') },
    { label: '匿名吹哨', value: count('whistle') },
    { label: '工程師開單', value: count('engineer') },
  ]
})

/** 通報分類（現場通報＋匿名吹哨），由多到少。 */
const categories = computed(() => {
  if (!data.value) return []
  const map = new Map()
  for (const c of data.value.categories.filter((x) => x.source !== 'engineer')) {
    const label = categoryById(c.category)?.label ?? '其他'
    map.set(label, (map.get(label) ?? 0) + c.count)
  }
  const rows = [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  const max = Math.max(1, ...rows.map((r) => r.count))
  return rows.map((r) => ({ ...r, pct: (r.count / max) * 100 }))
})

/** 每日各來源件數；沒有通報的日子也列出。 */
const daily = computed(() => {
  if (!data.value) return []
  const out = []
  for (let day = data.value.from; day <= data.value.to; day = addSiteDays(day, 1)) {
    const row = { day, label: `${Number(day.slice(5, 7))}/${Number(day.slice(8))}` }
    for (const s of SERIES) row[s.id] = data.value.daily.find((x) => x.day === day && x.source === s.id)?.count ?? 0
    row.total = SERIES.reduce((t, s) => t + row[s.id], 0)
    out.push(row)
  }
  return out
})
const dailyMax = computed(() => Math.max(1, ...daily.value.map((d) => d.total)))
const hovered = computed(() => daily.value[hover.value] ?? null)

const whistle = computed(() => {
  const w = data.value?.whistle ?? {}
  return [
    { label: '待審', value: w.pending ?? 0 },
    { label: '已派工', value: (w.open ?? 0) + (w.replied ?? 0) },
    { label: '已銷案', value: w.closed ?? 0 },
    { label: '不成立', value: w.dismissed ?? 0 },
  ]
})
</script>

<template>
  <div class="viz-root space-y-6">
    <!-- 篩選：一列，位於所有圖表上方 -->
    <div class="flex items-center gap-2">
      <button class="chip shrink-0 whitespace-nowrap px-4 text-base" :class="{ 'chip-on': days === 7 }" @click="setDays(7)">近 7 天</button>
      <button class="chip shrink-0 whitespace-nowrap px-4 text-base" :class="{ 'chip-on': days === 30 }" @click="setDays(30)">近 30 天</button>
      <span v-if="data" class="ml-auto text-right text-xs text-slate-500">{{ data.from }}<br />～ {{ data.to }}</span>
    </div>
    <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700">{{ error }}</p>

    <!-- 重新載入時保留上一次畫面（半透明），不閃白 -->
    <div v-if="data" class="space-y-6 transition-opacity" :class="{ 'opacity-50': loading }">
      <div class="grid grid-cols-3 gap-2">
        <div v-for="t in tiles" :key="t.label" class="rounded-2xl bg-white p-3 shadow-sm">
          <div class="text-xs font-semibold text-slate-500">{{ t.label }}</div>
          <div class="text-2xl font-semibold text-slate-900">{{ t.value.toLocaleString() }}</div>
        </div>
      </div>

      <section class="space-y-2">
        <h3 class="text-lg font-extrabold">分包商評比</h3>
        <p v-if="!data.contractors.length" class="text-slate-500">這段期間沒有報到或通報資料</p>
        <div v-else class="-mx-4 overflow-x-auto px-4">
          <table class="w-full min-w-[34rem] border-separate border-spacing-0 rounded-2xl bg-white text-sm shadow-sm">
            <thead>
              <tr class="text-left text-xs text-slate-500">
                <th class="p-3 font-semibold">工班</th>
                <th class="p-3 font-semibold">綜合分數</th>
                <th class="p-3 text-right font-semibold">報到合規</th>
                <th class="p-3 text-right font-semibold">整改準時</th>
                <th class="p-3 text-right font-semibold">A／B 級</th>
                <th class="p-3 text-right font-semibold">逾期</th>
                <th class="p-3 text-right font-semibold">平均整改</th>
              </tr>
            </thead>
            <tbody class="tabular-nums">
              <tr v-for="c in data.contractors" :key="c.contractorId" class="border-t">
                <td class="border-t border-slate-100 p-3 font-bold">{{ c.contractorName }}</td>
                <td class="border-t border-slate-100 p-3">
                  <div class="flex items-center gap-2">
                    <span class="w-8 font-bold">{{ c.score }}</span>
                    <span class="meter" :aria-label="`綜合分數 ${c.score} 分`"><span :style="{ width: `${c.score}%` }"></span></span>
                  </div>
                </td>
                <td class="border-t border-slate-100 p-3 text-right">{{ c.checkinRate }}%<span class="block text-xs text-slate-400">{{ c.checkins }} 人次・擋 {{ c.blocked }}</span></td>
                <td class="border-t border-slate-100 p-3 text-right">{{ c.onTimeRate }}%<span class="block text-xs text-slate-400">{{ c.onTime }}／{{ c.judged }}</span></td>
                <td class="border-t border-slate-100 p-3 text-right">{{ c.major }}／{{ c.normal }}</td>
                <td class="border-t border-slate-100 p-3 text-right" :class="c.overdue ? 'font-bold text-red-700' : ''">{{ c.overdue }}</td>
                <td class="border-t border-slate-100 p-3 text-right">{{ c.avgHours == null ? '—' : `${c.avgHours} 小時` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs leading-relaxed text-slate-500">{{ data.formula }}</p>
      </section>

      <section class="space-y-2">
        <h3 class="text-lg font-extrabold">現場通報分類</h3>
        <p v-if="!categories.length" class="text-slate-500">這段期間沒有現場通報</p>
        <ul v-else class="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <li v-for="c in categories" :key="c.label" class="grid grid-cols-[7.5rem_1fr] items-center gap-3">
            <span class="truncate text-sm text-slate-700">{{ c.label }}</span>
            <span class="flex items-center gap-2" :title="`${c.label}：${c.count} 件`">
              <span class="hbar" :style="{ width: `${c.pct}%` }"></span>
              <span class="text-sm font-semibold tabular-nums text-slate-900">{{ c.count }}</span>
            </span>
          </li>
        </ul>
      </section>

      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-extrabold">每日通報件數</h3>
          <button class="text-sm font-semibold text-amber-700" @click="tableView = !tableView">{{ tableView ? '看圖表' : '以表格檢視' }}</button>
        </div>
        <div class="flex flex-wrap gap-4 text-sm text-slate-700">
          <span v-for="s in SERIES" :key="s.id" class="flex items-center gap-1.5"><span class="swatch" :style="{ background: s.color }"></span>{{ s.label }}</span>
        </div>

        <div v-if="!tableView" class="relative rounded-2xl bg-white p-4 shadow-sm">
          <!-- 提示框：數值在前，來源在後；滑過或鍵盤聚焦皆可 -->
          <div class="mb-2 min-h-12 text-sm" aria-live="polite">
            <template v-if="hovered">
              <span class="font-bold text-slate-900">{{ hovered.label }}・共 {{ hovered.total }} 件</span>
              <span class="ml-2 inline-flex flex-wrap gap-x-3 text-slate-600">
                <span v-for="s in SERIES" :key="s.id" class="inline-flex items-center gap-1">
                  <span class="key" :style="{ background: s.color }"></span><b class="text-slate-900">{{ hovered[s.id] }}</b> {{ s.label }}
                </span>
              </span>
            </template>
            <span v-else class="text-slate-400">點選或滑過長條看當天件數</span>
          </div>
          <div class="flex h-36 items-end gap-0.5 border-b border-[var(--axis)]">
            <button
              v-for="(d, i) in daily"
              :key="d.day"
              class="col group flex h-full flex-1 flex-col justify-end"
              :aria-label="`${d.label} 共 ${d.total} 件：${SERIES.map((s) => `${s.label} ${d[s.id]}`).join('、')}`"
              @pointerenter="hover = i"
              @focus="hover = i"
              @click="hover = i"
            >
              <span class="stack" :class="{ lifted: hover === i }" :style="{ height: `${(d.total / dailyMax) * 100}%` }">
                <span v-for="s in [...SERIES].reverse().filter((s) => d[s.id])" :key="s.id" :style="{ flexGrow: d[s.id], background: s.color }"></span>
              </span>
            </button>
          </div>
          <div class="mt-1 flex justify-between text-xs tabular-nums text-[var(--muted)]">
            <span>{{ daily[0]?.label }}</span>
            <span>最高 {{ dailyMax }} 件</span>
            <span>{{ daily.at(-1)?.label }}</span>
          </div>
        </div>
        <div v-else class="-mx-4 overflow-x-auto px-4">
          <table class="w-full rounded-2xl bg-white text-sm shadow-sm">
            <thead>
              <tr class="text-left text-xs text-slate-500">
                <th class="p-2 font-semibold">日期</th>
                <th v-for="s in SERIES" :key="s.id" class="p-2 text-right font-semibold">{{ s.label }}</th>
                <th class="p-2 text-right font-semibold">合計</th>
              </tr>
            </thead>
            <tbody class="tabular-nums">
              <tr v-for="d in daily" :key="d.day" class="border-t border-slate-100">
                <td class="p-2">{{ d.label }}</td>
                <td v-for="s in SERIES" :key="s.id" class="p-2 text-right">{{ d[s.id] }}</td>
                <td class="p-2 text-right font-bold">{{ d.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="text-lg font-extrabold">工安點數排行</h3>
        <p v-if="!data.leaderboard.length" class="text-slate-500">這段期間還沒有發放點數</p>
        <ol v-else class="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          <li v-for="(p, i) in data.leaderboard" :key="i" class="flex items-center gap-3 p-3">
            <span class="w-6 text-center font-bold tabular-nums text-slate-500">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="font-bold">{{ p.name }}</span>
              <span class="block truncate text-sm text-slate-500">{{ p.contractorName }}・通報 {{ p.reports }} 件</span>
            </span>
            <span class="font-bold tabular-nums">⭐ {{ p.points }}</span>
          </li>
        </ol>
        <p class="text-xs text-slate-500">匿名吹哨不記身分，不列入點數排行。</p>
      </section>

      <section class="space-y-2">
        <h3 class="text-lg font-extrabold">匿名吹哨處理結果</h3>
        <div class="grid grid-cols-4 gap-2">
          <div v-for="w in whistle" :key="w.label" class="rounded-2xl bg-white p-3 text-center shadow-sm">
            <div class="text-2xl font-semibold text-slate-900">{{ w.value }}</div>
            <div class="text-xs font-semibold text-slate-500">{{ w.label }}</div>
          </div>
        </div>
      </section>
    </div>
    <p v-else-if="loading" class="py-12 text-center text-slate-500">載入中…</p>
  </div>
</template>

<style scoped>
.viz-root {
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --track: #cde2fb;
  --axis: #c3c2b7;
  --muted: #898781;
}
/* 評分量表：同色系淺色軌道 */
.meter {
  display: block;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}
.meter > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--series-1);
}
/* 排序橫條：單一色、細、資料端 4px 圓角 */
.hbar {
  display: block;
  min-width: 2px;
  height: 14px;
  border-radius: 0 4px 4px 0;
  background: var(--series-1);
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
.key {
  width: 12px;
  height: 3px;
  border-radius: 2px;
}
.col {
  align-items: center;
  padding: 0;
  background: none;
  min-width: 0;
}
.col:focus-visible {
  outline: 2px solid #0b0b0b;
  outline-offset: 2px;
}
/* 堆疊直條：最寬 24px、段與段之間 2px 留白、頂端 4px 圓角 */
.stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  max-width: 24px;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}
.stack > span {
  flex-basis: 0;
  min-height: 2px;
}
.stack.lifted {
  filter: brightness(1.12);
}
</style>
