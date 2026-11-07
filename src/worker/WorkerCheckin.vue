<script setup>
// 每日進場報到：① 工區 ② 資格檢核（含隔日工區管制）③ 危害告知簽認 ④ 防護具自檢 ⑤ 工區危險交接。
import { computed, reactive, ref } from 'vue'
import { PPE_ITEMS, SLA, STATUS_LABELS, locationText, missingPpe, remainingText, zoneLabel } from '../../shared/safety.js'
import { worker as api } from './api.js'

const props = defineProps({
  buildings: { type: Array, required: true },
  floors: { type: Array, required: true },
  me: { type: Object, required: true },
})
const emit = defineEmits(['done', 'cancel', 'edit-profile'])

const STEPS = [
  { n: 1, icon: '📍', title: '工區' },
  { n: 2, icon: '🪪', title: '資格' },
  { n: 3, icon: '📢', title: '危害告知' },
  { n: 4, icon: '🦺', title: '防護具' },
  { n: 5, icon: '⚠️', title: '危險交接' },
]

const prev = props.me.checkin
const step = ref(1)
const zone = reactive({ building: prev?.building ?? '', floors: [...(prev?.floors ?? [])] })
const heightWork = ref(prev?.heightWork ?? false)
const ppe = reactive(Object.fromEntries(PPE_ITEMS.map((p) => [p.id, Boolean(prev?.ppe?.[p.id])])))
const hazardsAck = ref(false)
const handoverAck = ref(false)
const ctx = ref(null)
const busy = ref(false)
const error = ref('')
const reasons = ref([])

const blocked = computed(() => Boolean(ctx.value && (!ctx.value.qualification.allowed || ctx.value.restrictions.length)))
const ppeMissing = computed(() => missingPpe(ppe, { height: heightWork.value }))

function toggleFloor(f) {
  const i = zone.floors.indexOf(f)
  if (i >= 0) zone.floors.splice(i, 1)
  else zone.floors.push(f)
}

async function loadContext() {
  busy.value = true
  error.value = ''
  try {
    ctx.value = await api.context(zone)
    return true
  } catch (e) {
    error.value = `無法取得報到資料：${e.message}（報到需要網路）`
    return false
  } finally {
    busy.value = false
  }
}

async function next() {
  error.value = ''
  if (step.value === 1) {
    if (!zone.floors.length) return (error.value = '請至少選一個今天施工的樓層')
    reasons.value = []
    if (await loadContext()) step.value = 2
    return
  }
  if (step.value === 2 && blocked.value) return
  if (step.value === 3 && !hazardsAck.value) return (error.value = '請按「我已了解並遵守」')
  if (step.value === 4 && ppeMissing.value.length) return (error.value = `請配戴：${ppeMissing.value.join('、')}`)
  if (step.value < 5) {
    step.value++
    window.scrollTo({ top: 0 })
    return
  }
  await submit()
}

async function submit() {
  if (ctx.value.defects.length && !handoverAck.value) return (error.value = '請確認已閱讀本工區的危險事項')
  busy.value = true
  try {
    const saved = await api.checkin({
      building: zone.building,
      floors: zone.floors,
      heightWork: heightWork.value,
      ppe: { ...ppe },
      hazardsAck: true,
      handoverAck: ctx.value.defects.map((d) => d.id),
    })
    emit('done', saved)
  } catch (e) {
    if (e.data?.reasons) {
      // 伺服器判定不得報到：回到資格頁顯示原因
      reasons.value = e.data.reasons
      await loadContext()
      step.value = 2
    } else if (e.data?.refresh) {
      await loadContext()
      handoverAck.value = false
      error.value = '工區危險事項剛有更新，請重新確認'
    } else error.value = e.message
  } finally {
    busy.value = false
  }
}

function back() {
  error.value = ''
  if (step.value > 1) step.value--
  else emit('cancel')
}

const sevClass = (s) => (s === 'major' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900')
</script>

<template>
  <section class="space-y-5 pb-32">
    <ol class="grid grid-cols-5 gap-1">
      <li
        v-for="s in STEPS"
        :key="s.n"
        class="rounded-xl py-2 text-center text-xs font-bold"
        :class="s.n === step ? 'bg-amber-500 text-slate-900' : s.n < step ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-500'"
      >
        <div class="text-lg">{{ s.n < step ? '✓' : s.icon }}</div>
        {{ s.title }}
      </li>
    </ol>

    <!-- ① 工區 -->
    <template v-if="step === 1">
      <h2 class="text-2xl font-extrabold">📍 今天在哪裡施工？</h2>
      <div>
        <label class="label">棟別</label>
        <div class="grid grid-cols-4 gap-2">
          <button class="chip px-1" :class="{ 'chip-on': !zone.building }" @click="zone.building = ''">全區</button>
          <button v-for="b in buildings" :key="b" class="chip px-1" :class="{ 'chip-on': zone.building === b }" @click="zone.building = b">{{ b }}</button>
        </div>
      </div>
      <div>
        <label class="label">樓層（可多選）<span class="text-red-500">*</span></label>
        <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
          <button v-for="f in floors" :key="f" class="chip px-1" :class="{ 'chip-on': zone.floors.includes(f) }" @click="toggleFloor(f)">{{ f }}</button>
        </div>
      </div>
      <button
        class="flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left text-lg font-bold"
        :class="heightWork ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'"
        @click="heightWork = !heightWork"
      >
        <span class="text-3xl">🪜</span>
        <span class="flex-1">今天有 2 公尺以上高處作業</span>
        <span class="text-2xl">{{ heightWork ? '✅' : '⬜' }}</span>
      </button>
    </template>

    <!-- ② 資格檢核＋工區管制 -->
    <template v-if="step === 2 && ctx">
      <h2 class="text-2xl font-extrabold">🪪 進場資格檢核</h2>
      <p class="text-slate-600">{{ me.worker.name }}・{{ me.worker.contractorName }}・{{ zoneLabel(zone) }}</p>

      <div v-if="ctx.restrictions.length" class="space-y-3 rounded-2xl bg-red-50 p-4 text-red-900 ring-2 ring-red-400">
        <p class="text-lg font-extrabold">⛔ 工區管制中，暫時不能進入</p>
        <p>貴工班在此工區有前一日未改善的 A 級缺失，須先會同安衛人員完成安全確認、解鎖後才能報到。</p>
        <div v-for="d in ctx.restrictions" :key="d.id" class="rounded-xl bg-white p-3">
          <div class="text-sm text-slate-500">{{ d.reportNo }}</div>
          <div class="font-bold">{{ locationText(d) }}｜{{ d.item }}</div>
        </div>
        <button class="btn btn-ghost w-full" :disabled="busy" @click="loadContext">🔄 安衛已解鎖，重新檢查</button>
      </div>

      <div v-if="ctx.qualification.blocks.length" class="space-y-2 rounded-2xl bg-red-50 p-4 text-red-900 ring-2 ring-red-400">
        <p class="text-lg font-extrabold">⛔ 資格不符，今日不能報到</p>
        <p v-for="b in ctx.qualification.blocks" :key="b">• {{ b }}</p>
        <p class="text-sm">請洽工務所；資料填錯可以直接修改。</p>
        <button class="btn btn-ghost w-full" @click="emit('edit-profile')">✏️ 修改我的資料</button>
      </div>

      <div v-if="reasons.length && !blocked" class="rounded-2xl bg-amber-50 p-4 text-amber-900">{{ reasons.join('；') }}</div>

      <ul class="space-y-2">
        <li v-for="p in ctx.qualification.passed" :key="p" class="rounded-xl bg-green-50 p-3 font-semibold text-green-900">✅ {{ p }}</li>
        <li v-for="w in ctx.qualification.warnings" :key="w" class="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">⚠️ {{ w }}</li>
      </ul>
    </template>

    <!-- ③ 危害告知（TBM） -->
    <template v-if="step === 3 && ctx">
      <h2 class="text-2xl font-extrabold">📢 今日危害告知</h2>
      <p class="text-sm text-slate-500">{{ ctx.hazards.isDefault ? '工地安全守則' : `工務所 ${ctx.hazards.date} 公告` }}</p>
      <ul class="space-y-2">
        <li v-for="(h, i) in ctx.hazards.items" :key="i" class="flex gap-3 rounded-2xl bg-white p-4 text-lg leading-relaxed shadow-sm">
          <span>⚠️</span><span>{{ h }}</span>
        </li>
      </ul>
      <button
        class="btn w-full min-h-16 text-xl"
        :class="hazardsAck ? 'bg-green-600 text-white' : 'btn-primary'"
        @click="hazardsAck = !hazardsAck"
      >
        {{ hazardsAck ? '✅ 已簽認：我已了解並遵守' : '✍️ 我已了解並遵守' }}
      </button>
    </template>

    <!-- ④ 防護具自檢 -->
    <template v-if="step === 4">
      <h2 class="text-2xl font-extrabold">🦺 防護具自我檢查</h2>
      <p class="text-slate-600">點選你現在已經配戴好的防護具</p>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="p in PPE_ITEMS"
          :key="p.id"
          class="relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center text-base font-bold"
          :class="ppe[p.id] ? 'border-green-500 bg-green-50 text-green-900' : 'border-slate-200 bg-white text-slate-700'"
          @click="ppe[p.id] = !ppe[p.id]"
        >
          <span class="text-3xl">{{ p.icon }}</span>{{ p.label }}
          <span v-if="p.required || (heightWork && p.requiredFor === 'height')" class="absolute right-2 top-2 rounded bg-red-100 px-1 text-xs text-red-700">必備</span>
          <span v-if="ppe[p.id]" class="absolute left-2 top-2">✅</span>
        </button>
      </div>
    </template>

    <!-- ⑤ 工區危險交接 -->
    <template v-if="step === 5 && ctx">
      <h2 class="text-2xl font-extrabold">⚠️ {{ zoneLabel(zone) }} 危險事項</h2>
      <p v-if="!ctx.defects.length" class="rounded-2xl bg-green-50 p-6 text-center text-lg font-bold text-green-800">👍 本工區目前沒有未改善的缺失</p>
      <template v-else>
        <p class="text-slate-600">以下缺失尚未改善完成，作業時請避開或做好防護：</p>
        <ul class="space-y-3">
          <li v-for="d in ctx.defects" :key="d.id" class="flex gap-3 rounded-2xl bg-white p-3 shadow-sm" :class="{ 'ring-2 ring-red-400': d.severity === 'major' }">
            <img v-if="d.photo" :src="d.photo" class="h-20 w-20 shrink-0 rounded-xl object-cover" alt="缺失照片" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1 text-sm">
                <span class="rounded px-1.5 font-bold" :class="sevClass(d.severity)">{{ SLA[d.severity].level }}級</span>
                <span class="text-slate-500">{{ STATUS_LABELS[d.status] }}</span>
                <span v-if="d.dueAt" :class="remainingText(d.dueAt).overdue ? 'font-bold text-red-600' : 'text-slate-500'">{{ remainingText(d.dueAt).text }}</span>
              </div>
              <div class="font-bold">{{ locationText(d) }}｜{{ d.item }}</div>
              <div v-if="d.description" class="line-clamp-2 text-sm text-slate-600">{{ d.description }}</div>
            </div>
          </li>
        </ul>
        <button
          class="flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left text-lg font-bold"
          :class="handoverAck ? 'border-green-500 bg-green-50 text-green-900' : 'border-red-300 bg-white text-slate-800'"
          @click="handoverAck = !handoverAck"
        >
          <span class="text-2xl">{{ handoverAck ? '✅' : '⬜' }}</span>我已確認以上危險事項
        </button>
      </template>
    </template>

    <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">⚠️ {{ error }}</p>

    <nav class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
      <div class="mx-auto flex max-w-xl gap-3">
        <button class="btn btn-ghost w-28" :disabled="busy" @click="back">{{ step === 1 ? '取消' : '上一步' }}</button>
        <button class="btn btn-primary flex-1" :disabled="busy || (step === 2 && blocked)" @click="next">
          {{ busy ? '處理中…' : step === 5 ? '✅ 完成報到' : '下一步 ➜' }}
        </button>
      </div>
    </nav>
  </section>
</template>
