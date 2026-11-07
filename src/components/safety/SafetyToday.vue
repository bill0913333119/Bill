<script setup>
// 今日總覽：報到人數、被擋人次、待審通報、A 級未改善、逾期；各工班在場人數與報到名冊。
import { computed } from 'vue'
import { roleLabel, siteTime, zoneLabel } from '../../../shared/safety.js'

const props = defineProps({ ov: { type: Object, required: true } })
const emit = defineEmits(['go'])

// 報到後才通過核驗的人，不再顯示報到當時的「尚未核驗」提醒
const warningsOf = (c) => c.warnings.filter((x) => !(c.verified && x.startsWith('身分與證照尚未經工務所核驗')))

const tiles = computed(() => [
  { label: '今日報到', value: props.ov.counts.checkins, tone: 'text-slate-900' },
  { label: '資格／管制被擋', value: props.ov.counts.blocked, tone: props.ov.counts.blocked ? 'text-red-600' : 'text-slate-900' },
  { label: '待審通報', value: props.ov.counts.pending, tone: props.ov.counts.pending ? 'text-amber-600' : 'text-slate-900', go: 'review' },
  { label: 'A 級未改善', value: props.ov.counts.majorOpen, tone: props.ov.counts.majorOpen ? 'text-red-600' : 'text-slate-900', go: 'track' },
  { label: '逾期未改善', value: props.ov.counts.overdue, tone: props.ov.counts.overdue ? 'text-red-600' : 'text-slate-900', go: 'track' },
  {
    label: '工區管制',
    value: props.ov.restrictions.filter((r) => !r.unlocked).length,
    tone: props.ov.restrictions.some((r) => !r.unlocked) ? 'text-red-600' : 'text-slate-900',
    go: 'control',
  },
])
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="t in tiles"
        :key="t.label"
        class="rounded-2xl bg-white p-3 text-center shadow-sm"
        :class="t.go ? 'active:bg-slate-50' : 'cursor-default'"
        @click="t.go && emit('go', t.go)"
      >
        <div class="text-3xl font-extrabold tabular-nums" :class="t.tone">{{ t.value }}</div>
        <div class="text-xs font-semibold text-slate-500">{{ t.label }}</div>
      </button>
    </div>

    <div class="rounded-2xl bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h3 class="font-extrabold">📢 今日危害告知</h3>
        <span class="text-xs text-slate-500">{{ ov.hazards.isDefault ? '使用預設內容' : ov.hazards.isToday ? '今日已更新' : `沿用 ${ov.hazards.date}` }}</span>
      </div>
      <p class="mt-1 line-clamp-2 text-sm text-slate-600">{{ ov.hazards.items.join('；') }}</p>
      <button class="mt-2 text-sm font-semibold text-amber-700" @click="emit('go', 'setup')">編輯 ›</button>
    </div>

    <div>
      <h3 class="label">在場工班</h3>
      <p v-if="!ov.crews.length" class="text-slate-500">今天還沒有人報到</p>
      <ul class="space-y-2">
        <li v-for="c in ov.crews" :key="c.contractorId" class="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
          <div>
            <div class="font-bold">{{ c.contractorName }}</div>
            <div class="text-sm text-slate-500">工班長：{{ c.leaders.join('、') || '未報到' }}</div>
          </div>
          <div class="text-2xl font-extrabold tabular-nums">{{ c.count }}<span class="text-sm font-semibold text-slate-500"> 人</span></div>
        </li>
      </ul>
    </div>

    <div v-if="ov.attempts.length">
      <h3 class="label text-red-700">⛔ 被擋下的報到</h3>
      <ul class="space-y-2">
        <li v-for="(a, i) in ov.attempts" :key="i" class="rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
          <div class="font-bold">{{ a.workerName }}・{{ a.contractorName }} <span class="text-sm font-normal text-slate-500">{{ siteTime(a.createdAt) }}</span></div>
          <div v-for="r in a.reasons" :key="r" class="text-sm text-red-800">• {{ r }}</div>
        </li>
      </ul>
    </div>

    <div>
      <h3 class="label">報到名冊（{{ ov.checkins.length }}）</h3>
      <ul class="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
        <li v-for="c in ov.checkins" :key="c.id" class="flex items-start gap-3 p-3">
          <span class="w-12 shrink-0 text-sm tabular-nums text-slate-500">{{ siteTime(c.createdAt).split(' ')[1] }}</span>
          <div class="min-w-0 flex-1">
            <div class="font-bold">
              {{ c.workerName }} <span class="text-sm font-normal text-slate-500">{{ roleLabel(c.role) }}・{{ c.contractorName }}</span>
            </div>
            <div class="text-sm text-slate-600">{{ zoneLabel(c) }}{{ c.heightWork ? '・🪜高處作業' : '' }}</div>
            <div v-if="warningsOf(c).length" class="text-xs text-amber-700">⚠️ {{ warningsOf(c).join('；') }}</div>
          </div>
          <span v-if="!c.verified" class="shrink-0 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">未核驗</span>
        </li>
      </ul>
    </div>
  </div>
</template>
