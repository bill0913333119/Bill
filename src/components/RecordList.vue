<script setup>
import { computed, ref } from 'vue'
import { locationOf, toDateInput } from '../lib/defect.js'
import { connect, contractorOf, store, tradeLabelOf } from '../store.js'

const emit = defineEmits(['open'])
const filter = ref('open')
const refreshing = ref(false)
const today = toDateInput(new Date())

const FILTERS = [
  ['open', '待改善'],
  ['replied', '待複查'],
  ['closed', '已結案'],
  ['all', '全部'],
]
const STATUS = {
  open: { text: '待改善', cls: 'bg-amber-100 text-amber-800' },
  replied: { text: '待複查', cls: 'bg-sky-100 text-sky-800' },
  closed: { text: '已結案', cls: 'bg-slate-100 text-slate-600' },
}

const list = computed(() =>
  store.records.filter(
    (r) => (filter.value === 'all' || r.status === filter.value) && (!store.settings.projectName || r.projectName === store.settings.projectName),
  ),
)
const countOf = (k) => store.records.filter((r) => r.status === k).length
const overdue = (r) => r.status === 'open' && r.dueDate < today

async function refresh() {
  refreshing.value = true
  await connect()
  refreshing.value = false
}
</script>

<template>
  <section>
    <div class="mb-3 grid grid-cols-4 gap-2">
      <button v-for="[k, l] in FILTERS" :key="k" class="chip px-1 text-base" :class="{ 'chip-on': filter === k }" @click="filter = k">
        {{ l }}<span v-if="k !== 'all' && countOf(k)" class="ml-1 text-sm">({{ countOf(k) }})</span>
      </button>
    </div>
    <div class="mb-4 flex items-center justify-between text-sm text-slate-500">
      <span>{{ store.server.available ? '☁️ 已連線' : '📴 離線模式' }}{{ store.server.error ? `・${store.server.error}` : '' }}</span>
      <button class="font-semibold text-amber-700" :disabled="refreshing" @click="refresh">{{ refreshing ? '更新中…' : '🔄 更新' }}</button>
    </div>

    <p v-if="!list.length" class="py-16 text-center text-lg text-slate-500">目前沒有紀錄</p>

    <ul class="space-y-3">
      <li
        v-for="r in list"
        :key="r.id"
        class="flex cursor-pointer gap-3 rounded-2xl bg-white p-3 shadow-sm active:bg-slate-50"
        :class="{ 'ring-2 ring-red-400': overdue(r), 'ring-2 ring-sky-400': r.status === 'replied' }"
        @click="emit('open', r)"
      >
        <img v-if="r.photos[0]" :src="r.photos[0]" class="h-20 w-20 shrink-0 rounded-xl object-cover" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            <span>{{ r.reportNo }}</span>
            <span v-if="r.severity === 'major'" class="font-bold text-red-600">🔴 重大</span>
            <span v-if="overdue(r)" class="font-bold text-red-600">已逾期</span>
            <span v-if="!r.synced" title="尚未同步">📴</span>
          </div>
          <div class="truncate text-lg font-bold">{{ locationOf(r) }}｜{{ r.item }}</div>
          <div class="truncate text-sm text-slate-600">{{ tradeLabelOf(r.tradeId) }}・{{ contractorOf(r.contractorId)?.name }}・期限 {{ r.dueDate }}</div>
        </div>
        <span class="shrink-0 self-center rounded-xl px-2 py-1 text-sm font-bold" :class="STATUS[r.status]?.cls">{{ STATUS[r.status]?.text }}</span>
      </li>
    </ul>
  </section>
</template>
