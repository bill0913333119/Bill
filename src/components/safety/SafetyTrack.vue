<script setup>
// 限期追蹤：已派工未銷案的缺失依期限排序，逾期者標紅、已升級者標示。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SLA, STATUS_LABELS, SOURCE_LABELS, locationText, remainingText } from '../../../shared/safety.js'

const props = defineProps({ ov: { type: Object, required: true } })
const emit = defineEmits(['open'])

const level = ref('all')
const now = ref(new Date())
let tick
onMounted(() => (tick = setInterval(() => (now.value = new Date()), 30_000)))
onBeforeUnmount(() => clearInterval(tick))

const list = computed(() => props.ov.active.filter((d) => level.value === 'all' || d.severity === level.value))
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-3 gap-2">
      <button class="chip px-1 text-base" :class="{ 'chip-on': level === 'all' }" @click="level = 'all'">全部 ({{ ov.active.length }})</button>
      <button class="chip px-1 text-base" :class="{ 'chip-on': level === 'major' }" @click="level = 'major'">A級</button>
      <button class="chip px-1 text-base" :class="{ 'chip-on': level === 'normal' }" @click="level = 'normal'">B級</button>
    </div>
    <p v-if="!list.length" class="rounded-2xl bg-green-50 p-6 text-center text-lg font-bold text-green-800">👍 沒有未銷案的缺失</p>
    <ul class="space-y-2">
      <li v-for="d in list" :key="d.id">
        <button
          class="flex w-full gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
          :class="{ 'ring-2 ring-red-500': d.status === 'open' && remainingText(d.dueAt, now).overdue, 'ring-2 ring-sky-300': d.status === 'replied' }"
          @click="emit('open', d)"
        >
          <img v-if="d.photos[0]" :src="d.photos[0]" class="h-16 w-16 shrink-0 rounded-xl object-cover" alt="" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1 text-xs">
              <span class="rounded px-1.5 font-bold" :class="d.severity === 'major' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'">{{ SLA[d.severity].level }}級</span>
              <span class="text-slate-500">{{ SOURCE_LABELS[d.source] }}・{{ STATUS_LABELS[d.status] }}</span>
              <span v-if="d.escalatedAt" class="rounded bg-red-100 px-1.5 font-bold text-red-700">⚠️ 已升級通報</span>
            </div>
            <div class="truncate font-bold">{{ locationText(d) }}｜{{ d.item }}</div>
            <div class="text-sm text-slate-600">{{ d.contractorName || '未指派' }}</div>
          </div>
          <div class="shrink-0 self-center text-right text-sm font-bold" :class="d.status === 'open' && remainingText(d.dueAt, now).overdue ? 'text-red-600' : 'text-slate-600'">
            {{ d.status === 'replied' ? '待複查' : remainingText(d.dueAt, now).text }}
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
