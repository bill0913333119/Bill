<script setup>
// 工安隨手拍：具名通報（可累積點數、立即派工）或匿名吹哨（不留身分，由安衛審核）。30 秒內送出。
import { computed, onMounted, ref, watch } from 'vue'
import { MAX_PHOTOS } from '../data/presets.js'
import { SAFETY_CATEGORIES, SLA } from '../../shared/safety.js'
import { processPhoto } from '../lib/image.js'
import PhotoAnnotator from '../components/PhotoAnnotator.vue'
import VoiceTextarea from '../components/VoiceTextarea.vue'
import { site } from './api.js'
import { queueReport, sendReport } from './submit.js'

const props = defineProps({
  siteKey: { type: String, required: true },
  projectName: { type: String, default: '' },
  buildings: { type: Array, required: true },
  floors: { type: Array, required: true },
  checkin: { type: Object, default: null }, // 今日報到（具名通報需要）
  mode: { type: String, default: 'named' }, // named | whistle
})
const emit = defineEmits(['done', 'cancel', 'checkin'])

const kind = ref(props.mode)
const photos = ref([])
const categoryId = ref('')
const severity = ref('')
const building = ref(props.checkin?.building ?? '')
const floor = ref(props.checkin?.floors?.[0] ?? '')
const unit = ref('')
const description = ref('')
const contractorId = ref('')
const crews = ref([])
const annotating = ref(-1)
const busy = ref(false)
const error = ref('')
const missing = ref([])
const cameraInput = ref()
const albumInput = ref()

const whistle = computed(() => kind.value === 'whistle')
const needCheckin = computed(() => !whistle.value && !props.checkin)

async function onFiles(e) {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.value.length)
  e.target.value = ''
  for (const f of files) {
    // 匿名吹哨的照片浮水印不印案名以外的資訊；重新編碼也會移除拍攝資訊（EXIF、GPS）
    photos.value.push(await processPhoto(f, { projectName: props.projectName }))
  }
}

function saveAnnotation(dataUrl) {
  photos.value[annotating.value] = dataUrl
  annotating.value = -1
}

async function loadCrews() {
  if (!floor.value) return (crews.value = [])
  try {
    crews.value = await site.crews(props.siteKey, { building: building.value, floor: floor.value })
  } catch {
    crews.value = []
  }
  if (!crews.value.some((c) => c.contractorId === contractorId.value)) contractorId.value = ''
}
watch([building, floor], loadCrews)
onMounted(loadCrews)

async function submit() {
  error.value = ''
  missing.value = []
  if (!photos.value.length) missing.value.push('照片')
  if (!categoryId.value) missing.value.push('分類')
  if (!severity.value) missing.value.push('危險等級')
  if (!floor.value) missing.value.push('樓層')
  if (missing.value.length) return
  const payload = {
    photos: photos.value,
    categoryId: categoryId.value,
    severity: severity.value,
    building: building.value,
    floor: floor.value,
    unit: unit.value.trim(),
    description: description.value.trim(),
    contractorId: contractorId.value || undefined,
  }
  busy.value = true
  try {
    const result = await sendReport(props.siteKey, kind.value, payload)
    emit('done', { kind: kind.value, result, queued: false })
  } catch (e) {
    if (e.status && e.status < 500 && e.status !== 429) {
      error.value = e.message
    } else {
      // 沒有網路（例如地下室）：先存手機，連網後自動送出
      await queueReport(props.siteKey, kind.value, payload)
      emit('done', { kind: kind.value, result: null, queued: true })
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-5 pb-32">
    <div class="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200 p-1">
      <button class="rounded-xl py-3 text-base font-bold" :class="!whistle ? 'bg-white text-slate-900 shadow' : 'text-slate-600'" @click="kind = 'named'">
        📷 具名通報<br /><span class="text-xs font-semibold">可累積工安點數</span>
      </button>
      <button class="rounded-xl py-3 text-base font-bold" :class="whistle ? 'bg-violet-700 text-white shadow' : 'text-slate-600'" @click="kind = 'whistle'">
        🕵️ 匿名吹哨<br /><span class="text-xs font-semibold">不留任何身分</span>
      </button>
    </div>

    <div v-if="whistle" class="rounded-2xl bg-violet-50 p-4 leading-relaxed text-violet-950 ring-1 ring-violet-200">
      <p class="font-extrabold">🔒 吹哨者保護</p>
      <p>系統<b>不會記錄</b>你的姓名、電話或帳號，照片的拍攝資訊也會移除，只保留照片、位置與時間。內容只有安衛人員看得到。送出後會給你一組回執碼，可以查詢處理進度。</p>
    </div>
    <div v-else-if="needCheckin" class="space-y-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
      <p class="font-bold">具名通報需先完成今日報到。</p>
      <p>或改用「匿名吹哨」直接通報。</p>
      <button class="btn btn-primary w-full" @click="emit('checkin')">🪪 去報到</button>
    </div>

    <template v-if="!needCheckin">
      <div>
        <label class="label">照片（1～{{ MAX_PHOTOS }} 張）<span class="text-red-500">*</span></label>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="(p, i) in photos" :key="i" class="relative aspect-square overflow-hidden rounded-2xl bg-slate-200">
            <button class="h-full w-full" :aria-label="`標註第 ${i + 1} 張照片`" @click="annotating = i">
              <img :src="p" class="h-full w-full object-cover" alt="通報照片" />
              <span class="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-xs font-bold text-white">✏️ 圈出危險</span>
            </button>
            <button class="absolute right-1 top-1 h-9 w-9 rounded-full bg-black/60 text-white" aria-label="刪除照片" @click="photos.splice(i, 1)">✕</button>
          </div>
          <template v-if="photos.length < MAX_PHOTOS">
            <button class="btn btn-primary aspect-square flex-col text-base" @click="cameraInput.click()"><span class="text-3xl">📷</span>拍照</button>
            <button v-if="!photos.length" class="btn btn-ghost aspect-square flex-col text-base" @click="albumInput.click()"><span class="text-3xl">🖼️</span>相簿</button>
          </template>
        </div>
        <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles" />
        <input ref="albumInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
      </div>

      <div>
        <label class="label">發現什麼危險？<span class="text-red-500">*</span></label>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="c in SAFETY_CATEGORIES"
            :key="c.id"
            class="chip flex min-h-14 items-center gap-2 px-3 text-left text-base"
            :class="{ 'chip-on': categoryId === c.id }"
            @click="categoryId = c.id"
          >
            <span class="text-2xl">{{ c.icon }}</span>{{ c.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">危險等級 <span class="text-red-500">*</span></label>
        <div class="grid grid-cols-1 gap-2">
          <button
            class="chip min-h-16 text-left"
            :class="severity === 'major' ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-300' : ''"
            @click="severity = 'major'"
          >
            🔴 {{ SLA.major.label }} <span class="block text-sm font-semibold">有人可能受傷，{{ SLA.major.hint }}</span>
          </button>
          <button class="chip min-h-16 text-left" :class="{ 'chip-on': severity === 'normal' }" @click="severity = 'normal'">
            🟡 {{ SLA.normal.label }} <span class="block text-sm font-semibold">{{ SLA.normal.hint }}</span>
          </button>
        </div>
      </div>

      <div class="space-y-3">
        <label class="label !mb-0">位置 <span class="text-red-500">*</span></label>
        <div class="grid grid-cols-4 gap-2">
          <button class="chip px-1" :class="{ 'chip-on': !building }" @click="building = ''">不確定</button>
          <button v-for="b in buildings" :key="b" class="chip px-1" :class="{ 'chip-on': building === b }" @click="building = b">{{ b }}</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <select v-model="floor" class="input" aria-label="樓層">
            <option value="" disabled>選擇樓層</option>
            <option v-for="f in floors" :key="f" :value="f">{{ f }}</option>
          </select>
          <input v-model="unit" class="input" placeholder="戶別／位置（選填）" aria-label="戶別或位置" />
        </div>
      </div>

      <div>
        <label class="label" for="r-desc">說明（可按麥克風用講的）</label>
        <VoiceTextarea id="r-desc" v-model="description" :rows="3" placeholder="例：3F 東側樓梯口護欄被拆掉，沒有警示" />
      </div>

      <div v-if="crews.length">
        <label class="label">可能是哪個工班造成的？（選填）</label>
        <div class="flex flex-wrap gap-2">
          <button class="chip px-3 text-base" :class="{ 'chip-on': !contractorId }" @click="contractorId = ''">不確定</button>
          <button v-for="c in crews" :key="c.contractorId" class="chip px-3 text-base" :class="{ 'chip-on': contractorId === c.contractorId }" @click="contractorId = c.contractorId">
            {{ c.contractorName }}（{{ c.count }} 人在場）
          </button>
        </div>
      </div>

      <div v-if="missing.length" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">⚠️ 還差：{{ missing.join('、') }}</div>
      <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">{{ error }}</p>
    </template>

    <nav class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
      <div class="mx-auto flex max-w-xl gap-3">
        <button class="btn btn-ghost w-28" :disabled="busy" @click="emit('cancel')">取消</button>
        <button
          v-if="!needCheckin"
          class="btn flex-1"
          :class="whistle ? 'bg-violet-700 text-white' : 'btn-line'"
          :disabled="busy"
          @click="submit"
        >
          {{ busy ? '送出中…' : whistle ? '🕵️ 匿名送出' : '📤 送出通報' }}
        </button>
      </div>
    </nav>

    <PhotoAnnotator v-if="annotating >= 0" :src="photos[annotating]" @save="saveAnnotation" @cancel="annotating = -1" />
  </section>
</template>
