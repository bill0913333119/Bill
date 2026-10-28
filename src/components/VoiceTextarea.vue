<script setup>
// 附麥克風的多行輸入：口述自動轉繁體中文並補標點。
import { onBeforeUnmount, ref } from 'vue'
import { appendSentence, speechSupported, startDictation } from '../lib/speech.js'

const model = defineModel({ type: String, default: '' })
defineProps({ rows: { type: Number, default: 3 }, placeholder: String, id: String })

const listening = ref(false)
const error = ref('')
let stop = null

function toggle() {
  if (listening.value) return stop?.()
  error.value = ''
  listening.value = true
  stop = startDictation({
    onText: (t) => (model.value = appendSentence(model.value, t)),
    onEnd: () => (listening.value = false),
    onError: (e) => (error.value = e === 'not-allowed' ? '請允許麥克風權限' : '語音辨識中斷，請再試一次'),
  })
}
onBeforeUnmount(() => stop?.())
</script>

<template>
  <div>
    <div class="relative">
      <textarea :id="id" v-model="model" :rows="rows" class="input py-3 pr-20" :placeholder="placeholder"></textarea>
      <button
        v-if="speechSupported"
        type="button"
        class="absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg"
        :class="listening ? 'animate-pulse bg-red-500 text-white' : 'bg-amber-500'"
        :aria-label="listening ? '停止語音輸入' : '語音輸入'"
        @click="toggle"
      >
        {{ listening ? '⏹' : '🎤' }}
      </button>
    </div>
    <p v-if="listening" class="mt-1 font-semibold text-red-600">● 收音中，說完請再按一次停止</p>
    <p v-if="error" class="mt-1 text-red-600">{{ error }}</p>
  </div>
</template>
