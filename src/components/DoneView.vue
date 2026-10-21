<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { pdfFile, shareMessage, shareToLine, downloadFile } from '../lib/share.js'
import { contractorOf, tradeLabelOf } from '../store.js'
import ReportSheet from './ReportSheet.vue'

const props = defineProps({ record: { type: Object, required: true } })
const emit = defineEmits(['new', 'close'])

const sheet = ref()
const file = ref(null)
const previewUrl = ref('')
const status = ref('')
const busy = ref(true)

async function build() {
  busy.value = true
  await nextTick()
  const { renderA4Pdf } = await import('../lib/pdf.js')
  const blob = await renderA4Pdf(sheet.value.$el)
  file.value = pdfFile(blob, props.record.reportNo)
  previewUrl.value = URL.createObjectURL(blob)
  busy.value = false
}

async function share() {
  const text = shareMessage(props.record, {
    tradeLabel: tradeLabelOf(props.record.tradeId),
    contractorName: contractorOf(props.record.contractorId)?.name ?? '',
  })
  const result = await shareToLine(file.value, text)
  status.value =
    result === 'shared' ? '✅ 已送出分享' : result === 'fallback' ? '已下載 PDF，請在 LINE 中附加檔案傳送' : ''
}

onMounted(build)
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-3xl bg-white p-6 text-center shadow">
      <div class="text-6xl">{{ busy ? '⏳' : '✅' }}</div>
      <h2 class="mt-2 text-2xl font-extrabold">{{ busy ? '正在產出 PDF…' : '缺失單已建立' }}</h2>
      <p class="mt-1 text-lg text-slate-600">{{ record.reportNo }}</p>
    </div>

    <button class="btn btn-line w-full min-h-20 text-2xl" :disabled="busy" @click="share">
      <span class="text-3xl">💬</span>產出並分享至 LINE
    </button>
    <p v-if="status" class="text-center font-semibold text-green-700">{{ status }}</p>

    <div class="grid grid-cols-2 gap-3">
      <a class="btn btn-ghost" :class="{ 'pointer-events-none opacity-40': busy }" :href="previewUrl" target="_blank">👁️ 預覽 PDF</a>
      <button class="btn btn-ghost" :disabled="busy" @click="downloadFile(file)">⬇️ 下載</button>
    </div>
    <button class="btn btn-primary w-full" @click="emit('new')">➕ 再登錄一筆</button>
    <button class="w-full py-3 text-slate-500" @click="emit('close')">回到紀錄列表</button>

    <!-- 離屏渲染 A4 版面供 PDF 擷取 -->
    <div style="position: fixed; left: -10000px; top: 0" aria-hidden="true">
      <ReportSheet ref="sheet" :record="record" />
    </div>
  </section>
</template>
