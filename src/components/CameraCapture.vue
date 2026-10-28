<script setup>
// 邊拍邊說：即時相機畫面＋語音辨識。口述的棟別、樓層、戶別、缺失項目會自動填入表單。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { speechSupported, startDictation } from '../lib/speech.js'

const props = defineProps({ hint: { type: String, default: '' }, shots: { type: Number, default: 0 }, max: { type: Number, default: 3 } })
const emit = defineEmits(['capture', 'speech', 'close', 'fallback'])

const video = ref()
const error = ref('')
const listening = ref(false)
const interim = ref('')
const transcript = ref([])
let stream = null
let stopSpeech = null
let wantListening = false

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    })
    video.value.srcObject = stream
    await video.value.play()
  } catch (e) {
    error.value = e?.name === 'NotAllowedError' ? '請允許相機權限，或改用「相機拍照」' : '無法開啟相機，請改用「相機拍照」'
  }
}

function startMic() {
  wantListening = true
  listening.value = true
  const run = () =>
    (stopSpeech = startDictation({
      onText: (t) => {
        if (!t) return
        transcript.value.push(t)
        interim.value = ''
        emit('speech', t)
      },
      onInterim: (t) => (interim.value = t),
      // 瀏覽器會在靜音後自動結束辨識，口述期間持續重啟
      onEnd: () => (wantListening ? setTimeout(run, 150) : (listening.value = false)),
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          wantListening = false
          error.value = '請允許麥克風權限才能口述'
        }
      },
    }))
  run()
}

function stopMic() {
  wantListening = false
  listening.value = false
  interim.value = ''
  stopSpeech?.()
}

const toggleMic = () => (listening.value ? stopMic() : startMic())

function shoot() {
  const v = video.value
  if (!v?.videoWidth) return
  const c = document.createElement('canvas')
  c.width = v.videoWidth
  c.height = v.videoHeight
  c.getContext('2d').drawImage(v, 0, 0)
  c.toBlob((blob) => blob && emit('capture', blob), 'image/jpeg', 0.92)
}

onMounted(async () => {
  await startCamera()
  if (speechSupported && !error.value) startMic()
})
onBeforeUnmount(() => {
  stopMic()
  stream?.getTracks().forEach((t) => t.stop())
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black text-white">
    <div class="relative min-h-0 flex-1">
      <video ref="video" class="h-full w-full object-cover" playsinline muted></video>

      <div v-if="error" class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center">
        <p class="text-lg">{{ error }}</p>
        <button class="btn btn-primary" @click="emit('fallback')">📷 改用相機拍照</button>
      </div>

      <div class="absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button class="rounded-full bg-black/50 px-4 py-2 text-lg font-bold" @click="emit('close')">✕ 完成</button>
        <span class="rounded-full bg-black/50 px-4 py-2 font-bold">{{ shots }} / {{ max }} 張</span>
      </div>

      <div class="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4">
        <p v-if="hint" class="rounded-xl bg-emerald-600/90 px-3 py-2 text-base font-semibold">✓ 已填入：{{ hint }}</p>
        <div v-if="transcript.length || interim" class="max-h-28 overflow-y-auto rounded-xl bg-black/60 px-3 py-2 text-base leading-relaxed">
          <p v-for="(t, i) in transcript.slice(-3)" :key="i">{{ t }}</p>
          <p v-if="interim" class="text-slate-300">{{ interim }}…</p>
        </div>
        <p v-else-if="speechSupported" class="rounded-xl bg-black/50 px-3 py-2 text-center text-base">
          🎤 邊拍邊說：「A棟 三樓 三零一室 牆面蜂窩」
        </p>
        <p v-else class="rounded-xl bg-black/50 px-3 py-2 text-center text-sm">此瀏覽器不支援語音，可於下一步用鍵盤的麥克風口述</p>
      </div>
    </div>

    <div class="flex items-center justify-around bg-black px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-4">
      <button
        v-if="speechSupported"
        class="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
        :class="listening ? 'animate-pulse bg-red-500' : 'bg-slate-700'"
        :aria-label="listening ? '停止口述' : '開始口述'"
        @click="toggleMic"
      >
        {{ listening ? '🎙️' : '🎤' }}
      </button>
      <span v-else class="w-16"></span>
      <button class="h-20 w-20 rounded-full border-4 border-white bg-white/90 active:scale-90" aria-label="拍照" @click="shoot"></button>
      <span class="w-16"></span>
    </div>
  </div>
</template>
