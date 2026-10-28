<script setup>
import { ref } from 'vue'
import { MAX_PHOTOS } from '../data/presets.js'
import { processPhoto } from '../lib/image.js'
import { applyVoice, store } from '../store.js'
import CameraCapture from './CameraCapture.vue'
import CoachTip from './CoachTip.vue'
import PhotoAnnotator from './PhotoAnnotator.vue'

const cameraInput = ref()
const albumInput = ref()
const busy = ref(false)
const live = ref(false)
const hint = ref('')
const annotating = ref(-1)

const canLive = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

async function addFiles(files) {
  const room = MAX_PHOTOS - store.draft.photos.length
  busy.value = true
  try {
    for (const f of [...files].slice(0, room)) {
      store.draft.photos.push(await processPhoto(f, { projectName: store.draft.projectName }))
    }
  } finally {
    busy.value = false
  }
}

async function onFiles(e) {
  const files = [...e.target.files]
  e.target.value = ''
  await addFiles(files)
}

async function onShot(blob) {
  if (store.draft.photos.length >= MAX_PHOTOS) return
  await addFiles([blob])
  if (store.draft.photos.length >= MAX_PHOTOS) live.value = false
}

const onSpeech = (t) => (hint.value = applyVoice(t) || hint.value)
const remove = (i) => store.draft.photos.splice(i, 1)
function saveAnnotation(dataUrl) {
  store.draft.photos[annotating.value] = dataUrl
  annotating.value = -1
}
function fallbackToFile() {
  live.value = false
  cameraInput.value.click()
}
</script>

<template>
  <section>
    <CoachTip id="photos" text="按「邊拍邊說」，一邊拍一邊口述「A棟 三樓 三零一室 牆面蜂窩」，系統會自動填好位置與項目。點照片可畫紅圈、箭頭。" />

    <div class="grid grid-cols-3 gap-3">
      <div v-for="(p, i) in store.draft.photos" :key="i" class="relative aspect-square overflow-hidden rounded-2xl bg-slate-200">
        <button class="h-full w-full" :aria-label="`標註第 ${i + 1} 張照片`" @click="annotating = i">
          <img :src="p" class="h-full w-full object-cover" alt="缺失照片" />
          <span class="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-sm font-bold text-white">✏️ 標註</span>
        </button>
        <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-lg text-white" aria-label="刪除照片" @click="remove(i)">✕</button>
      </div>
      <div v-if="busy" class="flex aspect-square items-center justify-center rounded-2xl bg-slate-200 text-slate-500">處理中…</div>
    </div>

    <div v-if="store.draft.photos.length < MAX_PHOTOS" class="mt-4 space-y-3">
      <button v-if="canLive" class="btn btn-primary min-h-28 w-full flex-col text-2xl" :disabled="busy" @click="live = true">
        <span class="text-5xl">🎥</span>邊拍邊說（口述自動填表）
      </button>
      <div class="grid grid-cols-2 gap-3">
        <button class="btn btn-ghost min-h-20 flex-col text-lg" :disabled="busy" @click="cameraInput.click()"><span class="text-3xl">📷</span>相機拍照</button>
        <button class="btn btn-ghost min-h-20 flex-col text-lg" :disabled="busy" @click="albumInput.click()"><span class="text-3xl">🖼️</span>從相簿選</button>
      </div>
    </div>
    <p class="mt-3 text-center text-slate-500">已選 {{ store.draft.photos.length }} / {{ MAX_PHOTOS }} 張</p>

    <div v-if="store.draft.floor || store.draft.item" class="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
      <div class="text-sm font-bold">已辨識</div>
      <div class="text-lg font-bold">{{ [store.draft.building, store.draft.floor, store.draft.unit && `${store.draft.unit}戶`, store.draft.item].filter(Boolean).join('・') }}</div>
    </div>

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
    <input ref="albumInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />

    <CameraCapture
      v-if="live"
      :hint="hint"
      :shots="store.draft.photos.length"
      :max="MAX_PHOTOS"
      @capture="onShot"
      @speech="onSpeech"
      @close="live = false"
      @fallback="fallbackToFile"
    />
    <PhotoAnnotator v-if="annotating >= 0" :src="store.draft.photos[annotating]" @save="saveAnnotation" @cancel="annotating = -1" />
  </section>
</template>
