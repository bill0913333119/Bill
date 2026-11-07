<script setup>
// 我的工安點數、具名通報進度，以及匿名吹哨回執查詢（回執只存在這支手機）。
import { onMounted, ref } from 'vue'
import { STATUS_LABELS, locationText } from '../../shared/safety.js'
import { formatDateTime } from '../lib/defect.js'
import { site, worker as api } from './api.js'
import { clearReceipts, loadReceipts } from './local.js'

const props = defineProps({ siteKey: { type: String, required: true }, signedIn: Boolean })
const emit = defineEmits(['back'])

const points = ref(null)
const reports = ref([])
const receipts = ref([])
const statuses = ref({})
const confirmClear = ref(false)
const error = ref('')

onMounted(async () => {
  receipts.value = await loadReceipts(props.siteKey)
  if (!props.signedIn) return
  try {
    ;[points.value, reports.value] = await Promise.all([api.points(), api.reports()])
  } catch (e) {
    error.value = `無法載入：${e.message}`
  }
})

async function check(r) {
  try {
    statuses.value[r.receipt] = STATUS_LABELS[(await site.receipt(props.siteKey, r.receipt)).status]
  } catch (e) {
    statuses.value[r.receipt] = e.message
  }
}

async function clear() {
  await clearReceipts(props.siteKey)
  receipts.value = []
  confirmClear.value = false
}
</script>

<template>
  <section class="space-y-5">
    <template v-if="signedIn">
      <div class="rounded-3xl bg-gradient-to-br from-amber-400 to-amber-500 p-5 text-slate-900 shadow">
        <div class="text-sm font-bold">我的工安點數</div>
        <div class="text-5xl font-extrabold tabular-nums">⭐ {{ points?.total ?? '—' }}</div>
        <p class="mt-1 text-sm">具名通報經改善銷案後發放：A 級 20 點、B 級 10 點。可向工務所兌換獎勵。</p>
      </div>
      <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700">{{ error }}</p>

      <div>
        <h3 class="label">我的具名通報</h3>
        <p v-if="!reports.length" class="text-slate-500">還沒有通報紀錄</p>
        <ul class="space-y-2">
          <li v-for="r in reports" :key="r.id" class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <img v-if="r.photo" :src="r.photo" class="h-14 w-14 shrink-0 rounded-lg object-cover" alt="" />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-slate-500">{{ r.reportNo }}・{{ formatDateTime(r.createdAt) }}</div>
              <div class="truncate font-bold">{{ locationText(r) }}｜{{ r.item }}</div>
            </div>
            <div class="shrink-0 text-right text-sm font-bold">
              <div>{{ STATUS_LABELS[r.status] }}</div>
              <div v-if="r.points" class="text-amber-700">+{{ r.points }} 點</div>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <div class="space-y-2 rounded-2xl bg-violet-50 p-4 text-violet-950 ring-1 ring-violet-200">
      <h3 class="font-extrabold">🕵️ 匿名吹哨回執</h3>
      <p class="text-sm">回執只存在這支手機，伺服器不知道是誰送的。不想留下紀錄可以清除。</p>
      <p v-if="!receipts.length" class="text-sm text-violet-700">沒有回執</p>
      <ul class="space-y-2">
        <li v-for="r in receipts" :key="r.receipt" class="flex items-center justify-between gap-2 rounded-xl bg-white p-3">
          <div class="min-w-0">
            <div class="font-bold">{{ r.reportNo }}</div>
            <div class="truncate text-xs text-slate-500">回執碼 {{ r.receipt }}</div>
          </div>
          <button class="shrink-0 rounded-lg bg-violet-700 px-3 py-2 text-sm font-bold text-white" @click="check(r)">
            {{ statuses[r.receipt] ?? '查詢進度' }}
          </button>
        </li>
      </ul>
      <template v-if="receipts.length">
        <button v-if="!confirmClear" class="text-sm underline" @click="confirmClear = true">清除匿名紀錄</button>
        <div v-else class="flex gap-2">
          <button class="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white" @click="clear">確定清除</button>
          <button class="rounded-lg bg-white px-3 py-2 text-sm" @click="confirmClear = false">取消</button>
        </div>
      </template>
    </div>

    <button class="w-full py-3 text-slate-500" @click="emit('back')">回首頁</button>
  </section>
</template>
