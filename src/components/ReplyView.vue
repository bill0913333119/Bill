<script setup>
// 廠商改善回報頁：由 LINE 卡片或連結開啟，免登入、免安裝。
import { onMounted, ref } from 'vue'
import { MAX_PHOTOS } from '../data/presets.js'
import * as api from '../lib/api.js'
import { formatDateTime } from '../lib/defect.js'
import { processPhoto } from '../lib/image.js'

const props = defineProps({ token: { type: String, required: true } })

const d = ref(null)
const error = ref('')
const photos = ref([]) // dataURL
const note = ref('')
const busy = ref(false)
const done = ref(false)
const cameraInput = ref()

async function load() {
  try {
    d.value = await api.getReply(props.token)
  } catch (e) {
    error.value = e.message
  }
}

async function onFiles(e) {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.value.length)
  e.target.value = ''
  for (const f of files) photos.value.push(await processPhoto(f, { projectName: `${d.value.reportNo} 改善後` }))
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const urls = []
    for (const p of photos.value) urls.push(await api.uploadReplyPhoto(props.token, await api.dataUrlToBlob(p)))
    d.value = await api.submitReply(props.token, { note: note.value, photos: urls })
    done.value = true
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
          <div class="mt-1 text-xl font-extrabold">{{ [d.building, d.floor].filter(Boolean).join(' ') }}｜{{ d.item }}</div>
          <div class="mt-1 text-slate-600">{{ d.tradeLabel }}・{{ d.contractorName }}</div>
          <div class="mt-1 font-bold text-red-600">限期改善：{{ d.dueDate }}</div>
          <p v-if="d.description" class="mt-3 whitespace-pre-wrap text-slate-700">{{ d.description }}</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
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

          <div>
            <label class="label">改善後照片（1～{{ MAX_PHOTOS }} 張）<span class="text-red-500">*</span></label>
            <div class="grid grid-cols-3 gap-3">
              <div v-for="(p, i) in photos" :key="i" class="relative aspect-square overflow-hidden rounded-2xl">
                <img :src="p" class="h-full w-full object-cover" alt="改善後照片" />
                <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-white" @click="photos.splice(i, 1)">✕</button>
              </div>
              <button v-if="photos.length < MAX_PHOTOS" class="btn btn-primary aspect-square flex-col text-lg" @click="cameraInput.click()">
                <span class="text-4xl">📷</span>拍照
              </button>
            </div>
            <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
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
