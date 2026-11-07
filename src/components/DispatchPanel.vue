<script setup>
// 審核派工：指定責任工班與等級（期限自通報時間起算），或判定通報不成立。
import { computed, onMounted, ref } from 'vue'
import { SLA, dueAtFor, remainingText, siteTime } from '../../shared/safety.js'
import * as api from '../lib/api.js'
import { adoptServerRecord, store } from '../store.js'

const props = defineProps({ record: { type: Object, required: true } })
const emit = defineEmits(['done'])

const crews = ref([])
const contractorId = ref(props.record.contractorId || '')
const severity = ref(props.record.severity)
const dismissing = ref(false)
const reason = ref('')
const busy = ref(false)
const error = ref('')
const result = ref('')

const needsSafety = computed(() => props.record.source === 'whistle' && store.server.role !== 'safety')
const others = computed(() => store.presets.contractors.filter((c) => !crews.value.some((x) => x.contractorId === c.id)))
// 期限自通報時間起算（與伺服器同一套規則）：改等級時即時顯示新期限
const due = computed(() => dueAtFor(severity.value, props.record.createdAt))

onMounted(async () => {
  if (!store.server.available || needsSafety.value) return
  try {
    crews.value = await api.crewsAt(props.record.projectName, props.record.building, props.record.floor)
  } catch {
    crews.value = []
  }
})

async function dispatch() {
  error.value = ''
  if (!contractorId.value) return (error.value = '請選擇責任工班')
  busy.value = true
  try {
    const d = await api.dispatchDefect(props.record.id, { contractorId: contractorId.value, severity: severity.value, by: store.settings.inspector })
    await adoptServerRecord(d)
    result.value = d.notified.length ? `✅ 已派工並通知：${d.notified.join('、')}` : '✅ 已派工（此工班尚無登錄的工班長，請另行電話聯絡）'
    emit('done', d)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function dismiss() {
  error.value = ''
  if (!reason.value.trim()) return (error.value = '請填寫不成立的原因')
  busy.value = true
  try {
    const d = await api.dismissDefect(props.record.id, { reason: reason.value.trim(), by: store.settings.inspector })
    await adoptServerRecord(d)
    result.value = '已判定不成立'
    emit('done', d)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-3xl bg-white p-5 shadow ring-2 ring-amber-300">
    <h3 class="text-lg font-extrabold">📋 審核派工</h3>
    <p v-if="result" class="rounded-xl bg-green-50 p-3 font-semibold text-green-800">{{ result }}</p>
    <p v-else-if="!store.server.available" class="text-slate-500">派工需要連線。</p>
    <p v-else-if="needsSafety" class="rounded-xl bg-violet-50 p-3 text-violet-900">🔒 匿名吹哨只能由安衛人員審核。請在「設定」輸入安衛金鑰。</p>
    <template v-else>
      <div>
        <div class="mb-1 text-sm font-bold text-slate-600">責任工班（今日在此位置報到的工班排前面）</div>
        <div v-if="crews.length" class="mb-2 flex flex-wrap gap-2">
          <button
            v-for="c in crews"
            :key="c.contractorId"
            class="chip px-3 text-left text-base"
            :class="{ 'chip-on': contractorId === c.contractorId }"
            @click="contractorId = c.contractorId"
          >
            {{ c.contractorName }}<span class="block text-xs font-semibold">在場 {{ c.count }} 人{{ c.leaders.length ? `・${c.leaders.join('、')}` : '' }}</span>
          </button>
        </div>
        <select v-model="contractorId" class="input" aria-label="責任工班">
          <option value="" disabled>{{ crews.length ? '或選擇其他工班' : '選擇責任工班' }}</option>
          <option v-for="c in crews" :key="c.contractorId" :value="c.contractorId">{{ c.contractorName }}（在場）</option>
          <option v-for="c in others" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button class="chip min-h-14 px-2 text-base" :class="severity === 'major' ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-300' : ''" @click="severity = 'major'">
          🔴 {{ SLA.major.label }}
        </button>
        <button class="chip min-h-14 px-2 text-base" :class="{ 'chip-on': severity === 'normal' }" @click="severity = 'normal'">🟡 {{ SLA.normal.label }}</button>
      </div>
      <p v-if="due" class="text-sm text-slate-600">
        改善期限：{{ siteTime(due) }}（{{ remainingText(due).text }}，自通報時間起算）
      </p>
      <p v-if="error" class="rounded-xl bg-red-50 p-3 text-red-700">{{ error }}</p>
      <button class="btn btn-primary w-full" :disabled="busy" @click="dispatch">📣 派工並通知工班</button>
      <div v-if="!dismissing" class="text-center">
        <button class="text-sm text-slate-500 underline" @click="dismissing = true">通報不成立…</button>
      </div>
      <div v-else class="space-y-2 rounded-xl bg-slate-50 p-3">
        <textarea v-model="reason" rows="2" class="input py-2" placeholder="不成立的原因，例：現場查無此情形" aria-label="不成立原因"></textarea>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-ghost min-h-12 text-base" @click="dismissing = false">取消</button>
          <button class="btn min-h-12 bg-slate-700 text-base text-white" :disabled="busy" @click="dismiss">判定不成立</button>
        </div>
      </div>
    </template>
  </div>
</template>
