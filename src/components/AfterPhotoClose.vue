<script setup>
// 現場複查銷案：逐張對照缺失照片，拍下改善後照片，填寫說明後銷案。
import { computed, ref } from 'vue'
import { processPhoto } from '../lib/image.js'
import PhotoAnnotator from './PhotoAnnotator.vue'
import VoiceTextarea from './VoiceTextarea.vue'

const props = defineProps({ record: { type: Object, required: true } })
const emit = defineEmits(['done', 'cancel'])

const slots = computed(() => Math.max(1, Math.min(3, props.record.photos.length)))
const after = ref(Array.from({ length: slots.value }, () => ''))
const note = ref('')
const busy = ref(-1)
const target = ref(0)
const annotating = ref(-1)
const missing = ref(false)
const cameraInput = ref()
const albumInput = ref()

function pick(i, from) {
  target.value = i
  ;(from === 'album' ? albumInput : cameraInput).value.click()
}

async function onFile(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  busy.value = target.value
  try {
    after.value[target.value] = await processPhoto(f, { projectName: `${props.record.reportNo} 改善後` })
    missing.value = false
  } finally {
    busy.value = -1
  }
}

function saveAnnotation(dataUrl) {
  after.value[annotating.value] = dataUrl
  annotating.value = -1
}

function confirm() {
  const photos = after.value.filter(Boolean)
  if (!photos.length) {
    missing.value = true
    return
  }
  emit('done', { photos, note: note.value.trim() })
}
</script>

<template>
  <div class="fixed inset-0 z-40 overflow-y-auto bg-slate-100">
    <div class="mx-auto max-w-xl space-y-5 px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),16px)]">
      <div class="flex items-center justify-between">
        <button class="py-2 text-lg text-slate-500" @click="emit('cancel')">取消</button>
        <h2 class="text-xl font-extrabold">📷 改善後拍照銷案</h2>
        <span class="w-10"></span>
      </div>

      <div class="rounded-2xl bg-sky-50 p-4 text-sky-900 ring-1 ring-sky-200">
        💡 到現場對照左邊的缺失照片，從<b>同一個角度</b>拍改善後的樣子。照片會放進通知單右側的「改善後對照」欄。
      </div>

      <div class="rounded-2xl bg-white p-4 shadow-sm">
        <div class="text-sm text-slate-500">{{ record.reportNo }}</div>
        <div class="text-lg font-bold">{{ [record.building, record.floor, record.unit].filter(Boolean).join(' ') }}｜{{ record.item }}</div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-center text-sm font-bold">
        <div class="text-red-700">缺失現況</div>
        <div class="text-green-700">改善後</div>
      </div>
      <div v-for="i in slots" :key="i" class="grid grid-cols-2 gap-3">
        <div class="aspect-square overflow-hidden rounded-2xl bg-slate-200">
          <img v-if="record.photos[i - 1]" :src="record.photos[i - 1]" class="h-full w-full object-cover" :alt="`缺失照片 ${i}`" />
        </div>
        <div v-if="after[i - 1]" class="relative aspect-square overflow-hidden rounded-2xl ring-4 ring-green-500">
          <button class="h-full w-full" :aria-label="`標註改善後照片 ${i}`" @click="annotating = i - 1">
            <img :src="after[i - 1]" class="h-full w-full object-cover" :alt="`改善後照片 ${i}`" />
            <span class="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-sm font-bold text-white">✏️ 標註</span>
          </button>
          <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-white" aria-label="刪除改善後照片" @click="after[i - 1] = ''">✕</button>
        </div>
        <div v-else class="flex aspect-square flex-col gap-2">
          <button class="btn btn-primary flex-1 flex-col text-lg" :disabled="busy >= 0" @click="pick(i - 1, 'camera')">
            <span class="text-3xl">{{ busy === i - 1 ? '⏳' : '📷' }}</span>拍改善後
          </button>
          <button class="rounded-xl border-2 border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600" :disabled="busy >= 0" @click="pick(i - 1, 'album')">🖼️ 從相簿選</button>
        </div>
      </div>

      <div>
        <label class="label" for="close-note">複查／銷案說明</label>
        <VoiceTextarea id="close-note" v-model="note" :rows="3" placeholder="例：已打除蜂窩並以無收縮砂漿補平，現場複查合格" />
      </div>

      <p v-if="missing" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">⚠️ 請至少拍 1 張改善後照片</p>

      <button class="btn btn-line min-h-16 w-full text-2xl" :disabled="busy >= 0" @click="confirm">✅ 確認銷案</button>
    </div>

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
    <input ref="albumInput" type="file" accept="image/*" class="hidden" @change="onFile" />
    <PhotoAnnotator v-if="annotating >= 0" :src="after[annotating]" @save="saveAnnotation" @cancel="annotating = -1" />
  </div>
</template>
