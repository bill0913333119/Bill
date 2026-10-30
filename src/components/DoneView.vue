<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { defectFlex } from '../../shared/flex.js'
import { canPickTarget, shareFlex } from '../lib/liff.js'
import { downloadFile, pdfFile, shareMessage, shareToLine } from '../lib/share.js'
import { attachPdf, closeWithPhotos, contractorOf, setStatus, store, tradeLabelOf } from '../store.js'
import AfterPhotoClose from './AfterPhotoClose.vue'
import ReportSheet from './ReportSheet.vue'

const props = defineProps({ record: { type: Object, required: true } })
const emit = defineEmits(['new', 'close'])

// 以 store 中的最新版本為準（同步後單號、回報狀態會更新）
const rec = computed(() => store.records.find((r) => r.id === props.record.id) ?? props.record)
const sheet = ref()
const file = ref(null)
const previewUrl = ref('')
const status = ref('')
const busy = ref(true)
const reviewing = ref(false)
const closing = ref(false)

async function build({ upload = !rec.value.pdfUrl } = {}) {
  busy.value = true
  try {
    await nextTick()
    const { renderA4Pdf } = await import('../lib/pdf.js')
    const blob = await renderA4Pdf(sheet.value.$el)
    file.value = pdfFile(blob, rec.value.reportNo)
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
    if (upload) await attachPdf(rec.value, blob).catch((e) => console.warn('PDF 上傳失敗', e))
  } finally {
    busy.value = false
  }
}

const cardData = () => ({
  ...rec.value,
  tradeLabel: tradeLabelOf(rec.value.tradeId),
  contractorName: contractorOf(rec.value.contractorId)?.name ?? '',
  photoUrl: rec.value.remotePhotos?.[0],
})

async function share() {
  status.value = ''
  if (canPickTarget()) {
    const sent = await shareFlex(defectFlex(cardData()))
    status.value = sent ? '✅ 已傳送圖文卡片' : ''
    return
  }
  const result = await shareToLine(file.value, shareMessage(rec.value, cardData()))
  status.value =
    result === 'shared' ? '✅ 已送出分享' : result === 'fallback' ? '已下載 PDF，請在 LINE 中附加檔案傳送' : ''
}

async function review(next) {
  let note = ''
  if (next === 'open' && rec.value.status === 'replied') {
    note = prompt('退回原因（會顯示給廠商）') ?? null
    if (note === null) return
  }
  reviewing.value = true
  try {
    await setStatus(rec.value, next, note)
    await build({ upload: next === 'closed' })
  } catch (e) {
    alert(e.message)
  } finally {
    reviewing.value = false
  }
}

async function onClosed({ photos, note }) {
  closing.value = false
  reviewing.value = true
  try {
    await closeWithPhotos(rec.value, { photos, note })
    // 銷案版 PDF：右欄放入改善後照片並蓋「已銷案」章
    await build({ upload: true })
    status.value = '✅ 已銷案，可將銷案單分享至 LINE'
  } finally {
    reviewing.value = false
  }
}

async function copyReplyLink() {
  await navigator.clipboard.writeText(rec.value.replyUrl)
  status.value = '✅ 已複製廠商回報連結'
}

onMounted(() => build())

// 離線建立或銷案的單據：連網同步完成後（單號可能由伺服器改配），重新產出 PDF 並上傳
watch(
  () => rec.value.synced && !rec.value.closePending,
  (ready, was) => {
    if (ready && !was && !busy.value) build({ upload: true })
  },
)
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-3xl bg-white p-6 text-center shadow">
      <div class="text-6xl">{{ busy ? '⏳' : rec.status === 'closed' ? '🏁' : rec.status === 'replied' ? '🔍' : '✅' }}</div>
      <h2 class="mt-2 text-2xl font-extrabold">
        {{ busy ? '正在產出 PDF…' : rec.status === 'closed' ? '已銷案' : rec.status === 'replied' ? '廠商已回報，待複查' : '缺失單已建立' }}
      </h2>
      <p class="mt-1 text-lg text-slate-600">{{ rec.reportNo }}</p>
      <p class="mt-1 text-sm" :class="rec.synced ? 'text-green-700' : 'text-amber-700'">
        {{ rec.synced ? '☁️ 已同步至雲端' : '📴 尚未同步（恢復連線後自動上傳）' }}
      </p>
    </div>

    <!-- 複查：廠商回報後，工程師檢視改善照片並結案或退回 -->
    <div v-if="rec.status === 'replied'" class="space-y-3 rounded-3xl bg-white p-5 shadow ring-2 ring-sky-300">
      <h3 class="text-lg font-extrabold">🛠️ 廠商改善回報</h3>
      <div class="grid grid-cols-3 gap-2">
        <a v-for="(p, i) in rec.afterPhotos" :key="i" :href="p" target="_blank">
          <img :src="p" class="aspect-square w-full rounded-xl object-cover" alt="改善後照片" />
        </a>
      </div>
      <p class="whitespace-pre-wrap text-slate-700">{{ rec.replyNote || '（未填寫說明）' }}</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="btn btn-ghost" :disabled="reviewing" @click="review('open')">↩️ 退回</button>
        <button class="btn btn-primary" :disabled="reviewing" @click="review('closed')">✅ 通過並銷案</button>
      </div>
    </div>

    <!-- 已銷案：顯示改善後照片與銷案資訊 -->
    <div v-if="rec.status === 'closed' && rec.afterPhotos?.length" class="space-y-3 rounded-3xl bg-white p-5 shadow ring-2 ring-green-300">
      <h3 class="text-lg font-extrabold">🏁 改善後照片</h3>
      <div class="grid grid-cols-3 gap-2">
        <img v-for="(p, i) in rec.afterPhotos" :key="i" :src="p" class="aspect-square w-full rounded-xl object-cover" alt="改善後照片" />
      </div>
      <p v-if="rec.reviewNote" class="whitespace-pre-wrap text-slate-700">{{ rec.reviewNote }}</p>
      <p v-if="rec.closePending" class="text-sm text-amber-700">📴 銷案尚未同步，連網後自動上傳</p>
    </div>

    <button v-if="rec.status === 'open'" class="btn btn-primary min-h-20 w-full text-2xl" :disabled="busy || reviewing" @click="closing = true">
      <span class="text-3xl">📷</span>改善後拍照銷案
    </button>

    <button class="btn btn-line w-full min-h-20 text-2xl" :disabled="busy" @click="share">
      <span class="text-3xl">💬</span>{{ rec.status === 'closed' ? '分享銷案單至 LINE' : '產出並分享至 LINE' }}
    </button>
    <p v-if="status" class="text-center font-semibold text-green-700">{{ status }}</p>

    <div class="grid grid-cols-2 gap-3">
      <a class="btn btn-ghost" :class="{ 'pointer-events-none opacity-40': busy }" :href="previewUrl" target="_blank">👁️ 預覽 PDF</a>
      <button class="btn btn-ghost" :disabled="busy" @click="downloadFile(file)">⬇️ 下載</button>
    </div>
    <button v-if="rec.replyUrl && rec.status === 'open'" class="btn btn-ghost w-full text-lg" @click="copyReplyLink">🔗 複製廠商回報連結</button>
    <button v-if="rec.status === 'closed'" class="btn btn-ghost w-full text-lg" :disabled="reviewing" @click="review('open')">重新開啟</button>

    <button class="btn btn-primary w-full" @click="emit('new')">➕ 再登錄一筆</button>
    <button class="w-full py-3 text-slate-500" @click="emit('close')">回到紀錄列表</button>

    <!-- 離屏渲染 A4 版面供 PDF 擷取 -->
    <div style="position: fixed; left: -10000px; top: 0" aria-hidden="true">
      <ReportSheet ref="sheet" :record="rec" />
    </div>

    <AfterPhotoClose v-if="closing" :record="rec" @done="onClosed" @cancel="closing = false" />
  </section>
</template>
