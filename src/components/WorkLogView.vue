<script setup>
// 每日工作日誌：送出後才能「下班簽退」。
import { computed, ref, watch } from 'vue'
import { toDateInput } from '../lib/defect.js'
import { WEATHERS, canClockOut, validateLog } from '../lib/worklog.js'
import { clockOut, currentLog, ensureTodayLog, saveLog, store, today } from '../store.js'
import VoiceTextarea from './VoiceTextarea.vue'

const emit = defineEmits(['settings'])

const log = ref(ensureTodayLog())
const missing = ref([])
const busy = ref(false)
const message = ref('')

// 姓名或專案變動時重建今日日誌（尚未送出才會變動）
watch(
  () => [store.settings.inspector, store.draft.projectName],
  () => {
    if (!log.value.submittedAt) log.value = { ...ensureTodayLog(), ...pickEditable(log.value) }
  },
)
const pickEditable = ({ weather, workContent, manpower, issues, tomorrowPlan }) => ({ weather, workContent, manpower, issues, tomorrowPlan })

const submitted = computed(() => canClockOut(log.value))
const clockedOut = computed(() => Boolean(log.value.clockOutAt))
const hhmm = (iso) => toDateInput(new Date(iso)) + ' ' + new Date(iso).toTimeString().slice(0, 5)

const todayOpen = computed(() => store.records.filter((r) => r.status !== 'closed' && (!log.value.projectName || r.projectName === log.value.projectName)))
const overdue = computed(() => todayOpen.value.filter((r) => r.status === 'open' && r.dueDate < today()))
const awaitingReview = computed(() => todayOpen.value.filter((r) => r.status === 'replied'))

const history = computed(() =>
  store.logs.filter((l) => l.submittedAt && l.engineer === store.settings.inspector.trim()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7),
)

async function saveDraft() {
  log.value = await saveLog(log.value)
  message.value = '✔ 已暫存'
}

async function submit() {
  missing.value = validateLog(log.value)
  if (missing.value.length) return
  busy.value = true
  try {
    log.value = await saveLog(log.value, { submit: true })
    message.value = '✅ 日誌已送出，現在可以下班簽退'
  } finally {
    busy.value = false
  }
}

async function leave() {
  busy.value = true
  try {
    log.value = await clockOut(currentLog() ?? log.value)
    message.value = ''
  } catch (e) {
    message.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-5">
    <div class="rounded-3xl bg-white p-5 shadow">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-extrabold">📒 今日工作日誌</h2>
        <span class="text-slate-500">{{ log.date }}</span>
      </div>
      <p class="mt-1 text-sm text-slate-500">每天下班前填寫並送出，送出後才能簽退下班。</p>
      <div v-if="!store.settings.inspector.trim()" class="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
        請先填寫工程師姓名。
        <button class="font-bold underline" @click="emit('settings')">前往設定</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-2xl bg-white p-3 shadow-sm"><div class="text-2xl font-extrabold">{{ log.defectsOpened }}</div><div class="text-sm text-slate-500">今日開單</div></div>
      <div class="rounded-2xl bg-white p-3 shadow-sm"><div class="text-2xl font-extrabold text-green-700">{{ log.defectsClosed }}</div><div class="text-sm text-slate-500">今日結案</div></div>
      <div class="rounded-2xl bg-white p-3 shadow-sm" :class="overdue.length ? 'ring-2 ring-red-400' : ''">
        <div class="text-2xl font-extrabold" :class="overdue.length ? 'text-red-600' : ''">{{ overdue.length }}</div><div class="text-sm text-slate-500">逾期未改</div>
      </div>
    </div>
    <p v-if="awaitingReview.length" class="rounded-xl bg-sky-50 p-3 text-sky-900 ring-1 ring-sky-200">🔍 有 {{ awaitingReview.length }} 筆廠商已回報，等待你複查。</p>

    <fieldset class="space-y-5" :disabled="submitted">
      <div>
        <label class="label">天氣</label>
        <div class="grid grid-cols-4 gap-2">
          <button v-for="w in WEATHERS" :key="w.id" class="chip flex flex-col items-center py-2" :class="{ 'chip-on': log.weather === w.id }" @click="log.weather = w.id">
            <span class="text-2xl">{{ w.icon }}</span><span class="text-base">{{ w.label }}</span>
          </button>
        </div>
      </div>
      <div>
        <label class="label" for="work">今日施工內容 <span class="text-red-500">*</span></label>
        <VoiceTextarea id="work" v-model="log.workContent" :rows="4" placeholder="例：A棟 3F 泥作粉刷、B1 機電管線整合、巡檢開立缺失 3 筆" />
      </div>
      <div>
        <label class="label" for="men">出工人數 <span class="text-red-500">*</span></label>
        <input id="men" v-model.trim="log.manpower" class="input" inputmode="numeric" placeholder="例：泥作 8、水電 5、鋼筋 6，共 19 人" />
      </div>
      <div>
        <label class="label" for="issues">協調事項／問題</label>
        <VoiceTextarea id="issues" v-model="log.issues" :rows="3" placeholder="例：電梯井吊料動線需與 C 棟協調" />
      </div>
      <div>
        <label class="label" for="plan">明日預定</label>
        <VoiceTextarea id="plan" v-model="log.tomorrowPlan" :rows="3" placeholder="例：複查 5F 防水缺失、A 棟外牆施工架查核" />
      </div>
    </fieldset>

    <div v-if="missing.length" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">⚠️ 還差：{{ missing.join('、') }}</div>
    <p v-if="message" class="text-center font-semibold" :class="message.startsWith('✅') || message.startsWith('✔') ? 'text-green-700' : 'text-red-600'">{{ message }}</p>

    <div v-if="!submitted" class="grid grid-cols-2 gap-3">
      <button class="btn btn-ghost" :disabled="busy" @click="saveDraft">💾 暫存</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">📤 送出日誌</button>
    </div>
    <p v-else class="text-center text-green-700">📒 日誌已於 {{ hhmm(log.submittedAt) }} 送出{{ log.synced ? '（已同步）' : '（連線後自動同步）' }}</p>

    <button v-if="!clockedOut" class="btn w-full min-h-20 text-2xl" :class="submitted ? 'btn-line' : 'bg-slate-200 text-slate-400'" :disabled="!submitted || busy" @click="leave">
      🏠 下班簽退
    </button>
    <p v-if="!submitted && !clockedOut" class="-mt-3 text-center text-sm text-slate-500">請先送出今日工作日誌，才能簽退</p>
    <div v-if="clockedOut" class="rounded-3xl bg-green-50 p-5 text-center text-green-800">
      <div class="text-5xl">🏠</div>
      <div class="mt-1 text-xl font-extrabold">已下班簽退 {{ hhmm(log.clockOutAt) }}</div>
      <div class="text-sm">辛苦了，明天見！</div>
    </div>

    <div v-if="history.length">
      <h3 class="label">近 7 天日誌</h3>
      <ul class="space-y-2">
        <li v-for="l in history" :key="l.id" class="rounded-2xl bg-white p-3 text-sm shadow-sm">
          <div class="flex justify-between font-bold"><span>{{ l.date }} {{ WEATHERS.find((w) => w.id === l.weather)?.icon }}</span><span class="text-slate-500">開單 {{ l.defectsOpened }}・結案 {{ l.defectsClosed }}</span></div>
          <div class="mt-1 line-clamp-2 text-slate-600">{{ l.workContent }}</div>
        </li>
      </ul>
    </div>
  </section>
</template>
