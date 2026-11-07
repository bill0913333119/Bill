<script setup>
// 工班長／分包商負責人：本工班待改善缺失，依期限排序；點開即可同角度拍照回報。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SLA, STATUS_LABELS, locationText, remainingText } from '../../shared/safety.js'
import ReplyView from '../components/ReplyView.vue'
import { worker as api } from './api.js'

const emit = defineEmits(['back'])
const data = ref(null)
const error = ref('')
const opening = ref(null)
const now = ref(new Date())
let tick

async function load() {
  error.value = ''
  try {
    data.value = await api.tasks()
  } catch (e) {
    error.value = e.message
  }
}

function close() {
  opening.value = null
  load()
}

onMounted(() => {
  load()
  tick = setInterval(() => (now.value = new Date()), 30_000)
})
onBeforeUnmount(() => clearInterval(tick))
</script>

<template>
  <ReplyView v-if="opening" :token="opening.replyToken" embedded @back="close" />
  <section v-else class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-extrabold">🛠️ 本工班待改善</h2>
      <button class="text-sm font-semibold text-amber-700" @click="load">🔄 更新</button>
    </div>
    <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700">{{ error }}</p>
    <p v-else-if="data && !data.allowed" class="rounded-2xl bg-amber-50 p-4 text-amber-900">{{ data.reason }}</p>
    <p v-else-if="data && !data.tasks.length" class="rounded-2xl bg-green-50 p-6 text-center text-lg font-bold text-green-800">👍 目前沒有待改善的缺失</p>
    <ul v-else-if="data" class="space-y-3">
      <li v-for="t in data.tasks" :key="t.id">
        <button
          class="flex w-full gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
          :class="{ 'ring-2 ring-red-500': remainingText(t.dueAt, now).overdue, 'ring-2 ring-sky-300': t.status === 'replied' }"
          @click="opening = t"
        >
          <img v-if="t.photo" :src="t.photo" class="h-20 w-20 shrink-0 rounded-xl object-cover" alt="缺失照片" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1 text-sm">
              <span class="rounded px-1.5 font-bold" :class="t.severity === 'major' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'">
                {{ SLA[t.severity].level }}級
              </span>
              <span class="text-slate-500">{{ t.reportNo }}・{{ STATUS_LABELS[t.status] }}</span>
            </div>
            <div class="text-lg font-bold">{{ locationText(t) }}｜{{ t.item }}</div>
            <div v-if="t.status === 'open'" class="text-sm font-bold" :class="remainingText(t.dueAt, now).overdue ? 'text-red-600' : 'text-slate-600'">
              ⏱️ {{ remainingText(t.dueAt, now).text }}
            </div>
            <div v-if="t.reviewNote" class="text-sm text-red-700">↩️ 退回：{{ t.reviewNote }}</div>
          </div>
          <span class="self-center text-2xl text-slate-400">›</span>
        </button>
      </li>
    </ul>
    <button class="w-full py-3 text-slate-500" @click="emit('back')">回首頁</button>
  </section>
</template>
