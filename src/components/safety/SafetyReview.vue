<script setup>
// 待審派工：匿名吹哨與無法自動判定責任工班的現場通報。
import { ref } from 'vue'
import { SLA, SOURCE_LABELS, categoryById, locationText, remainingText, siteTime } from '../../../shared/safety.js'
import DispatchPanel from '../DispatchPanel.vue'

defineProps({ ov: { type: Object, required: true } })
const emit = defineEmits(['refresh', 'open'])

// 派工後該筆會離開待審清單，結果顯示在清單上方
const toast = ref('')
function onDone(d) {
  if (d.status === 'dismissed') toast.value = `${d.reportNo} 已判定不成立`
  else toast.value = d.notified?.length ? `✅ ${d.reportNo} 已派工並通知：${d.notified.join('、')}` : `✅ ${d.reportNo} 已派工（該工班尚無登錄的工班長，請另行電話聯絡）`
  emit('refresh')
}
</script>

<template>
  <div class="space-y-5">
    <p v-if="toast" class="rounded-2xl bg-green-50 p-4 font-semibold text-green-800 ring-1 ring-green-200">{{ toast }}</p>
    <p v-if="!ov.pending.length" class="rounded-2xl bg-green-50 p-6 text-center text-lg font-bold text-green-800">👍 沒有待審的通報</p>
    <article v-for="d in ov.pending" :key="d.id" class="space-y-3">
      <div class="flex gap-3 rounded-2xl bg-white p-3 shadow-sm" :class="{ 'ring-2 ring-red-400': remainingText(d.dueAt).overdue }">
        <img v-if="d.photos[0]" :src="d.photos[0]" class="h-24 w-24 shrink-0 rounded-xl object-cover" alt="通報照片" />
        <div v-else class="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-4xl">🔒</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1 text-sm">
            <span class="rounded px-1.5 font-bold" :class="d.source === 'whistle' ? 'bg-violet-700 text-white' : 'bg-sky-600 text-white'">
              {{ d.source === 'whistle' ? '🕵️' : '👷' }} {{ SOURCE_LABELS[d.source] }}
            </span>
            <span class="rounded px-1.5 font-bold" :class="d.severity === 'major' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'">{{ SLA[d.severity].level }}級</span>
          </div>
          <div class="mt-1 font-bold">{{ categoryById(d.category)?.icon }} {{ d.item }}・{{ locationText(d) }}</div>
          <p class="line-clamp-3 text-sm text-slate-600">{{ d.description || '（未填說明）' }}</p>
          <div class="text-xs text-slate-500">
            {{ d.reportNo }}・{{ siteTime(d.createdAt) }}
            <span :class="remainingText(d.dueAt).overdue ? 'font-bold text-red-600' : ''">・{{ remainingText(d.dueAt).text }}</span>
            <span v-if="d.reporterName">・通報人 {{ d.reporterName }}</span>
          </div>
          <button class="mt-1 text-sm font-semibold text-amber-700" @click="emit('open', d)">看詳細 ›</button>
        </div>
      </div>
      <DispatchPanel :record="d" @done="onDone" />
    </article>
  </div>
</template>
