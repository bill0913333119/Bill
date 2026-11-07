<script setup>
// 廠商改善回報頁：由 LINE 卡片、連結或工人端「本工班待改善」開啟，免登入、免安裝。
// 每張缺失照片旁對應一格改善後照片，方便從同一角度拍攝對照。
import { computed, onMounted, ref } from 'vue'
import { MAX_PHOTOS } from '../data/presets.js'
import { remainingText, siteTime } from '../../shared/safety.js'
import * as api from '../lib/api.js'
import { formatDateTime, locationOf } from '../lib/defect.js'
import { processPhoto } from '../lib/image.js'

const props = defineProps({ token: { type: String, required: true }, embedded: Boolean })
const emit = defineEmits(['back', 'submitted'])

const d = ref(null)
const error = ref('')
const after = ref([]) // 依缺失照片順序對照的改善後照片（dataURL）
const note = ref('')
const busy = ref(false)
const done = ref(false)
const cameraInput = ref()
const albumInput = ref()
const target = ref(0)

const slots = computed(() => Math.max(1, Math.min(MAX_PHOTOS, d.value?.photos.length ?? 1)))
const photos = computed(() => after.value.filter(Boolean))
const due = computed(() => {
  if (!d.value) return ''
  if (!d.value.dueAt || d.value.source === 'engineer') return d.value.dueDate
  return `${siteTime(d.value.dueAt)}（${remainingText(d.value.dueAt).text}）`
})

function pick(i, from = 'camera') {
  target.value = i
  ;(from === 'album' ? albumInput : cameraInput).value.click()
}

async function load() {
  try {
    d.value = await api.getReply(props.token)
  } catch (e) {
    error.value = e.message
  }
}

async function onFiles(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (f) after.value[target.value] = await processPhoto(f, { projectName: `${d.value.reportNo} 改善後` })
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const urls = []
    for (const p of photos.value) urls.push(await api.uploadReplyPhoto(props.token, await api.dataUrlToBlob(p)))
    d.value = await api.submitReply(props.token, { note: note.value, photos: urls })
    done.value = true
    emit('submitted')
  } catch (e) {
    error.value = `送出失敗：${e.message}`
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto min-h-dvh max-w-xl pb-10">
    <header class="bg-slate-900 px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] text-white">
      <button v-if="embedded" class="mb-2 rounded-lg bg-slate-700 px-3 py-1 text-sm" @click="emit('back')">← 回到工班缺失</button>
      <div class="text-xs text-slate-400">工地缺失改善回報</div>
      <div class="text-xl font-bold">{{ d?.projectName ?? '載入中…' }}</div>
    </header>

    <main class="space-y-5 px-4 py-5">
      <p v-if="error && !d" class="rounded-2xl bg-red-50 p-6 text-center text-lg text-red-700">{{ error }}</p>

      <template v-if="d">
        <div class="rounded-3xl bg-white p-5 shadow">
          <div class="flex items-center gap-2 text-sm text-slate-500">
            {{ d.reportNo }}
            <span v-if="d.severity === 'major'" class="font-bold text-red-600">🔴 重大</span>
          </div>
          <div class="mt-1 text-xl font-extrabold">{{ locationOf(d) }}｜{{ d.item }}</div>
          <div class="mt-1 text-slate-600">{{ d.tradeLabel }}・{{ d.contractorName }}</div>
          <div class="mt-1 font-bold text-red-600">限期改善：{{ due }}</div>
          <p v-if="d.description" class="mt-3 whitespace-pre-wrap text-slate-700">{{ d.description }}</p>
          <!-- 填寫回報時照片改在下方逐張對照顯示 -->
          <div v-if="done || d.status !== 'open'" class="mt-3 grid grid-cols-3 gap-2">
            <img v-for="(p, i) in d.photos" :key="i" :src="p" class="aspect-square w-full rounded-xl object-cover" alt="缺失照片" />
          </div>
          <a v-if="d.pdfUrl" :href="d.pdfUrl" target="_blank" class="mt-3 block text-center font-semibold text-amber-700">📄 下載缺失單 PDF</a>
        </div>

        <div v-if="d.status === 'closed'" class="rounded-3xl bg-green-50 p-6 text-center text-xl font-bold text-green-800">
          🏁 本缺失已複查銷案，辛苦了！
        </div>

        <div v-else-if="done || d.status === 'replied'" class="rounded-3xl bg-sky-50 p-6 text-center text-sky-900">
          <div class="text-5xl">✅</div>
          <div class="mt-2 text-xl font-bold">已回報，等待工程師複查</div>
          <div v-if="d.repliedAt" class="mt-1 text-sm">回報時間：{{ formatDateTime(d.repliedAt) }}</div>
          <button v-if="!done" class="mt-3 text-sm underline" @click="d.status = 'open'">重新回報</button>
        </div>

        <template v-else>
          <div v-if="d.reviewNote" class="rounded-2xl bg-red-50 p-4 text-red-800 ring-1 ring-red-200">
            ↩️ 前次回報被退回：{{ d.reviewNote }}
          </div>

          <div class="space-y-3">
            <label class="label !mb-0">改善後照片 <span class="text-red-500">*</span></label>
            <p class="rounded-xl bg-sky-50 p-3 text-sky-900">💡 請從與左邊缺失照片<b>相同的角度</b>拍攝改善後的樣子。</p>
            <div class="grid grid-cols-2 gap-3 text-center text-sm font-bold">
              <div class="text-red-700">缺失現況</div>
              <div class="text-green-700">改善後</div>
            </div>
            <div v-for="i in slots" :key="i" class="grid grid-cols-2 gap-3">
              <div class="aspect-square overflow-hidden rounded-2xl bg-slate-200">
                <img v-if="d.photos[i - 1]" :src="d.photos[i - 1]" class="h-full w-full object-cover" :alt="`缺失照片 ${i}`" />
              </div>
              <div v-if="after[i - 1]" class="relative aspect-square overflow-hidden rounded-2xl ring-4 ring-green-500">
                <img :src="after[i - 1]" class="h-full w-full object-cover" :alt="`改善後照片 ${i}`" />
                <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-white" aria-label="刪除改善後照片" @click="after[i - 1] = ''">✕</button>
              </div>
              <div v-else class="flex aspect-square flex-col gap-2">
                <button class="btn btn-primary flex-1 flex-col text-lg" @click="pick(i - 1)"><span class="text-3xl">📷</span>拍改善後</button>
                <button class="rounded-xl border-2 border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600" @click="pick(i - 1, 'album')">🖼️ 從相簿選</button>
              </div>
            </div>
            <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
            <input ref="albumInput" type="file" accept="image/*" class="hidden" @change="onFiles" />
          </div>

          <div>
            <label class="label">改善說明</label>
            <textarea v-model="note" rows="3" class="input py-3" placeholder="例：已打除蜂窩並以無收縮水泥砂漿補平"></textarea>
          </div>

          <p v-if="error" class="text-red-600">{{ error }}</p>
          <button class="btn btn-line w-full min-h-16" :disabled="busy || !photos.length" @click="submit">
            {{ busy ? '上傳中…' : '📤 送出改善回報' }}
          </button>
        </template>
      </template>
    </main>
  </div>
</template>
