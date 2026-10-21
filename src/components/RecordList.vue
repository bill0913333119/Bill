<script setup>
import { computed, ref } from 'vue'
import { contractorOf, store, tradeLabelOf, updateRecord } from '../store.js'
import { toDateInput } from '../lib/defect.js'

const emit = defineEmits(['open'])
const filter = ref('open')
const today = toDateInput(new Date())

const list = computed(() => store.records.filter((r) => filter.value === 'all' || r.status === filter.value))
const overdue = (r) => r.status === 'open' && r.dueDate < today

function toggleStatus(r) {
  updateRecord({ ...r, status: r.status === 'open' ? 'closed' : 'open', closedAt: r.status === 'open' ? new Date().toISOString() : null })
}
</script>

<template>
  <section>
    <div class="mb-4 grid grid-cols-3 gap-2">
      <button v-for="[k, l] in [['open', '待改善'], ['closed', '已完成'], ['all', '全部']]" :key="k" class="chip" :class="{ 'chip-on': filter === k }" @click="filter = k">{{ l }}</button>
    </div>

    <p v-if="!list.length" class="py-16 text-center text-lg text-slate-500">目前沒有紀錄</p>

    <ul class="space-y-3">
      <li v-for="r in list" :key="r.id" class="flex gap-3 rounded-2xl bg-white p-3 shadow-sm" :class="{ 'ring-2 ring-red-400': overdue(r) }">
        <img v-if="r.photos[0]" :src="r.photos[0]" class="h-20 w-20 shrink-0 rounded-xl object-cover" />
        <div class="min-w-0 flex-1" @click="emit('open', r)">
          <div class="flex items-center gap-2 text-sm text-slate-500">
            <span>{{ r.reportNo }}</span>
            <span v-if="r.severity === 'major'" class="font-bold text-red-600">🔴 重大</span>
            <span v-if="overdue(r)" class="font-bold text-red-600">已逾期</span>
          </div>
          <div class="truncate text-lg font-bold">{{ [r.building, r.floor].filter(Boolean).join(' ') }}｜{{ r.item }}</div>
          <div class="truncate text-sm text-slate-600">{{ tradeLabelOf(r.tradeId) }}・{{ contractorOf(r.contractorId)?.name }}・期限 {{ r.dueDate }}</div>
        </div>
        <button class="shrink-0 self-center rounded-xl px-3 py-2 text-sm font-bold" :class="r.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'" @click="toggleStatus(r)">
          {{ r.status === 'open' ? '結案' : '重開' }}
        </button>
      </li>
    </ul>
  </section>
</template>
