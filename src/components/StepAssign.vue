<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { appendSentence, speechSupported, startDictation } from '../lib/speech.js'
import { store } from '../store.js'
import CoachTip from './CoachTip.vue'

const listening = ref(false)
const speechError = ref('')
let stop = null

function toggleMic() {
  if (listening.value) return stop?.()
  speechError.value = ''
  listening.value = true
  stop = startDictation({
    onText: (t) => (store.draft.description = appendSentence(store.draft.description, t)),
    onEnd: () => (listening.value = false),
    onError: (err) => (speechError.value = err === 'not-allowed' ? '請允許麥克風權限' : '語音辨識中斷，請再試一次'),
  })
}
onBeforeUnmount(() => stop?.())

// 同工種廠商排前面
const contractors = computed(() =>
  [...store.presets.contractors].sort((a, b) => (b.tradeId === store.draft.tradeId) - (a.tradeId === store.draft.tradeId)),
)
</script>

<template>
  <section class="space-y-6">
    <CoachTip id="assign" text="按麥克風直接講缺失狀況，系統自動轉成文字。廠商與期限已自動帶好，確認即可。" />

    <div>
      <label class="label">缺失詳細說明</label>
      <div class="relative">
        <textarea v-model="store.draft.description" rows="5" class="input py-3 pr-20" placeholder="例：3F 東側浴室牆角滲水，需重新施作防水層"></textarea>
        <button
          v-if="speechSupported"
          class="absolute bottom-3 right-3 flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-lg"
          :class="listening ? 'animate-pulse bg-red-500 text-white' : 'bg-amber-500'"
          :aria-label="listening ? '停止語音輸入' : '語音輸入'"
          @click="toggleMic"
        >
          {{ listening ? '⏹' : '🎤' }}
        </button>
      </div>
      <p v-if="listening" class="mt-2 font-semibold text-red-600">● 收音中，說完請再按一次停止</p>
      <p v-if="speechError" class="mt-2 text-red-600">{{ speechError }}</p>
      <p v-if="!speechSupported" class="mt-2 text-sm text-slate-500">此瀏覽器不支援語音輸入，可使用鍵盤上的麥克風。</p>
    </div>

    <div>
      <label class="label">責任分包商 <span class="text-red-500">*</span></label>
      <select v-model="store.draft.contractorId" class="input">
        <option value="" disabled>請選擇</option>
        <option v-for="c in contractors" :key="c.id" :value="c.id">
          {{ c.name }}{{ c.tradeId === store.draft.tradeId ? '（推薦）' : '' }}
        </option>
      </select>
    </div>

    <div>
      <label class="label">限期改善日 <span class="text-red-500">*</span></label>
      <input v-model="store.draft.dueDate" type="date" class="input" />
      <p class="mt-1 text-sm text-slate-500">預設為今天起 3 天</p>
    </div>
  </section>
</template>
