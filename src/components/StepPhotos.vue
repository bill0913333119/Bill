<script setup>
import { ref } from 'vue'
import { MAX_PHOTOS } from '../data/presets.js'
import { processPhoto } from '../lib/image.js'
import { store } from '../store.js'
import CoachTip from './CoachTip.vue'

const cameraInput = ref()
const albumInput = ref()
const busy = ref(false)

async function onFiles(e) {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - store.draft.photos.length)
  e.target.value = ''
  busy.value = true
  try {
    for (const f of files) {
      store.draft.photos.push(await processPhoto(f, { projectName: store.draft.projectName }))
    }
  } finally {
    busy.value = false
  }
}

const remove = (i) => store.draft.photos.splice(i, 1)
</script>

<template>
  <section>
    <CoachTip id="photos" text="先拍缺失照片（最多 3 張）。系統會自動壓縮並加上日期浮水印，不用另外處理。" />

    <div class="grid grid-cols-3 gap-3">
      <div v-for="(p, i) in store.draft.photos" :key="i" class="relative aspect-square overflow-hidden rounded-2xl bg-slate-200">
        <img :src="p" class="h-full w-full object-cover" alt="缺失照片" />
        <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-lg text-white" @click="remove(i)">✕</button>
      </div>
      <div v-if="busy" class="flex aspect-square items-center justify-center rounded-2xl bg-slate-200 text-slate-500">處理中…</div>
    </div>

    <div v-if="store.draft.photos.length < MAX_PHOTOS" class="mt-4 grid grid-cols-2 gap-3">
      <button class="btn btn-primary min-h-32 flex-col text-2xl" :disabled="busy" @click="cameraInput.click()">
        <span class="text-5xl">📷</span>現場拍照
      </button>
      <button class="btn btn-ghost min-h-32 flex-col text-2xl" :disabled="busy" @click="albumInput.click()">
        <span class="text-5xl">🖼️</span>從相簿選
      </button>
    </div>
    <p class="mt-3 text-center text-slate-500">已選 {{ store.draft.photos.length }} / {{ MAX_PHOTOS }} 張</p>

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
    <input ref="albumInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
  </section>
</template>
