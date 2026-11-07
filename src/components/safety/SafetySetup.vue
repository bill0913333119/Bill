<script setup>
// 設定：工地報到 QR 與海報、今日危害告知、人員名冊核驗、分包商名單。
import { computed, onMounted, ref, watch } from 'vue'
import { TRADES } from '../../data/presets.js'
import { roleLabel } from '../../../shared/safety.js'
import * as api from '../../lib/api.js'
import { connect, store } from '../../store.js'

const props = defineProps({ ov: { type: Object, required: true }, project: { type: String, required: true } })
const emit = defineEmits(['refresh'])

const embedded = typeof window !== 'undefined' && window.self !== window.top
const msg = ref('')

// ---------- 工地報到 QR ----------
const site = ref(null)
const qr = ref('')
const poster = ref('')
const confirmRotate = ref(false)

async function loadSite(rotate = false) {
  site.value = rotate ? await api.rotateSiteLink(props.project) : await api.siteLink(props.project)
  const QRCode = (await import('qrcode')).default
  qr.value = await QRCode.toDataURL(site.value.url, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
  poster.value = await drawPoster()
  confirmRotate.value = false
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/** A4 直式報到海報（150dpi），印出來貼在工地入口。 */
async function drawPoster() {
  const W = 1240
  const H = 1754
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const font = (size, weight = 700) => `${weight} ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#f59e0b'
  ctx.fillRect(0, 0, W, 300)
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.font = font(120, 900)
  ctx.fillText('工人進場報到', W / 2, 165)
  ctx.font = font(56)
  ctx.fillText(props.project, W / 2, 260)
  ctx.drawImage(await loadImage(qr.value), (W - 820) / 2, 360, 820, 820)
  ctx.textAlign = 'left'
  const lines = [
    ['①', '手機相機或 LINE 掃描上方 QR Code'],
    ['②', '第一次：登錄姓名、工班與證照'],
    ['③', '每天進場：資格檢核 → 危害告知 → 防護具 → 危險交接'],
    ['⚠️', '發現危險：工安隨手拍，或匿名吹哨（不留身分）'],
  ]
  lines.forEach(([n, t], i) => {
    const y = 1290 + i * 96
    ctx.font = font(52, 900)
    ctx.fillStyle = '#b45309'
    ctx.fillText(n, 120, y)
    ctx.font = font(44, 700)
    ctx.fillStyle = '#0f172a'
    ctx.fillText(t, 200, y)
  })
  ctx.font = font(28, 400)
  ctx.fillStyle = '#64748b'
  ctx.textAlign = 'center'
  ctx.fillText(site.value.url, W / 2, H - 60)
  return c.toDataURL('image/png')
}

function downloadPoster() {
  if (embedded) return (msg.value = '此預覽版無法下載檔案；請用正式網址開啟，或長按海報圖片儲存')
  const a = document.createElement('a')
  a.href = poster.value
  a.download = `${props.project}_工人報到QR.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(site.value.url)
    msg.value = '✅ 已複製報到連結'
  } catch {
    msg.value = site.value.url
  }
}

// ---------- 今日危害告知 ----------
const hazardText = ref(props.ov.hazards.items.join('\n'))
const savingHazards = ref(false)
async function saveHazards() {
  savingHazards.value = true
  try {
    await api.saveHazards(props.project, hazardText.value.split('\n'), store.settings.inspector)
    msg.value = '✅ 今日危害告知已更新，工人報到時會看到'
    emit('refresh')
  } catch (e) {
    msg.value = e.message
  } finally {
    savingHazards.value = false
  }
}

// ---------- 人員名冊 ----------
const workers = ref([])
const workerFilter = ref('pending')
const shownWorkers = computed(() =>
  workers.value.filter((w) => (workerFilter.value === 'pending' ? w.active && !w.verifiedAt : workerFilter.value === 'all' ? true : w.active)),
)
async function loadWorkers() {
  workers.value = await api.listWorkers(props.project)
}
// 按「更新」時名冊一併更新（新登錄的工人才會出現）
watch(
  () => props.ov,
  () => loadWorkers().catch((e) => (msg.value = e.message)),
)
async function setWorker(w, body) {
  const updated = await api.patchWorker(w.id, { ...body, by: store.settings.inspector || '工務所' })
  Object.assign(w, updated)
}

// ---------- 分包商 ----------
const contractors = ref([])
const newContractor = ref({ name: '', tradeId: '' })
async function loadContractors() {
  contractors.value = await api.listContractors()
}
async function addContractor() {
  if (!newContractor.value.name.trim()) return
  await api.addContractor(newContractor.value)
  newContractor.value = { name: '', tradeId: '' }
  await loadContractors()
  connect() // 更新開單用的廠商清單
}
async function saveContractor(c, body) {
  Object.assign(c, await api.patchContractor(c.id, body))
  connect()
}

onMounted(async () => {
  try {
    await Promise.all([loadSite(), loadWorkers(), loadContractors()])
  } catch (e) {
    msg.value = e.message
  }
})
</script>

<template>
  <div class="space-y-6">
    <p v-if="msg" class="rounded-2xl bg-sky-50 p-3 text-sky-900 ring-1 ring-sky-200">{{ msg }}</p>

    <section class="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 class="text-lg font-extrabold">📱 工地報到 QR Code</h3>
      <p class="text-sm text-slate-600">印出海報貼在工地入口，工人用手機相機或 LINE 掃描即可登錄、報到與通報，不用安裝 App。</p>
      <img v-if="poster" :src="poster" class="mx-auto w-full max-w-xs rounded-lg border border-slate-200" alt="工人報到海報" />
      <div class="grid grid-cols-2 gap-2">
        <button class="btn btn-primary min-h-12 text-base" :disabled="!poster" @click="downloadPoster">⬇️ 下載海報</button>
        <button class="btn btn-ghost min-h-12 text-base" :disabled="!site" @click="copyLink">🔗 複製連結</button>
      </div>
      <template v-if="store.server.role === 'safety'">
        <button v-if="!confirmRotate" class="text-sm text-slate-500 underline" @click="confirmRotate = true">QR Code 外流？重新產生…</button>
        <div v-else class="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p>重新產生後，舊海報立即失效（已登錄的工人不受影響），需重新張貼。</p>
          <div class="flex gap-2">
            <button class="rounded-lg bg-red-600 px-3 py-2 font-bold text-white" @click="loadSite(true)">確定重新產生</button>
            <button class="rounded-lg bg-white px-3 py-2" @click="confirmRotate = false">取消</button>
          </div>
        </div>
      </template>
    </section>

    <section class="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h3 class="text-lg font-extrabold">📢 今日危害告知（TBM）</h3>
      <p class="text-sm text-slate-600">一行一項。工人每天報到時須閱讀並簽認；沒更新時沿用上一次內容。</p>
      <textarea v-model="hazardText" rows="7" class="input py-3 text-base" aria-label="今日危害告知"></textarea>
      <button class="btn btn-primary w-full" :disabled="savingHazards" @click="saveHazards">💾 更新今日危害告知</button>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-extrabold">👷 人員名冊（{{ workers.filter((w) => w.active).length }}）</h3>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button class="chip px-1 text-sm" :class="{ 'chip-on': workerFilter === 'pending' }" @click="workerFilter = 'pending'">
          待核驗 ({{ workers.filter((w) => w.active && !w.verifiedAt).length }})
        </button>
        <button class="chip px-1 text-sm" :class="{ 'chip-on': workerFilter === 'active' }" @click="workerFilter = 'active'">在職</button>
        <button class="chip px-1 text-sm" :class="{ 'chip-on': workerFilter === 'all' }" @click="workerFilter = 'all'">全部</button>
      </div>
      <p v-if="!shownWorkers.length" class="text-slate-500">沒有人員</p>
      <ul class="space-y-2">
        <li v-for="w in shownWorkers" :key="w.id" class="space-y-2 rounded-2xl bg-white p-3 shadow-sm" :class="{ 'opacity-60': !w.active }">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-bold">{{ w.name }} <span class="text-sm font-normal text-slate-500">{{ roleLabel(w.role) }}・{{ w.contractorName }}</span></div>
              <div class="text-sm text-slate-500">{{ w.phone }}{{ w.hasLine ? '・已綁 LINE' : '' }}</div>
            </div>
            <span class="shrink-0 rounded px-1.5 text-xs font-bold" :class="w.verifiedAt ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'">
              {{ w.verifiedAt ? '已核驗' : '未核驗' }}
            </span>
          </div>
          <ul class="space-y-0.5 text-sm">
            <li v-for="b in w.qualification.blocks" :key="b" class="text-red-700">⛔ {{ b }}</li>
            <li v-for="p in w.qualification.passed" :key="p" class="text-slate-600">✅ {{ p }}</li>
            <li v-for="x in w.qualification.warnings.filter((x) => !x.startsWith('身分與證照'))" :key="x" class="text-amber-700">⚠️ {{ x }}</li>
          </ul>
          <div class="flex gap-2">
            <button class="btn min-h-10 flex-1 text-sm" :class="w.verifiedAt ? 'btn-ghost' : 'btn-primary'" @click="setWorker(w, { verified: !w.verifiedAt })">
              {{ w.verifiedAt ? '取消核驗' : '✔ 已核對證件，核驗通過' }}
            </button>
            <button class="btn btn-ghost min-h-10 px-3 text-sm" @click="setWorker(w, { active: !w.active })">{{ w.active ? '停用' : '啟用' }}</button>
          </div>
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <h3 class="text-lg font-extrabold">🏢 分包商／工班</h3>
      <ul class="space-y-2">
        <li v-for="c in contractors" :key="c.id" class="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm" :class="{ 'opacity-60': !c.active }">
          <input
            :value="c.name"
            class="input min-h-10 min-w-0 flex-1 text-base"
            :aria-label="`${c.name} 名稱`"
            @change="saveContractor(c, { name: $event.target.value })"
          />
          <select :value="c.tradeId" class="input min-h-10 w-24 text-base" :aria-label="`${c.name} 工種`" @change="saveContractor(c, { tradeId: $event.target.value })">
            <option value="">—</option>
            <option v-for="t in TRADES" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
          <button class="shrink-0 px-2 text-sm font-semibold" :class="c.active ? 'text-slate-500' : 'text-green-700'" @click="saveContractor(c, { active: !c.active })">
            {{ c.active ? '停用' : '啟用' }}
          </button>
        </li>
      </ul>
      <div class="flex gap-2">
        <input v-model="newContractor.name" class="input min-w-0 flex-1" placeholder="新增分包商名稱" aria-label="新增分包商名稱" />
        <select v-model="newContractor.tradeId" class="input w-24" aria-label="新增分包商工種">
          <option value="">工種</option>
          <option v-for="t in TRADES" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
        <button class="btn btn-primary shrink-0 px-4" :disabled="!newContractor.name.trim()" @click="addContractor">新增</button>
      </div>
    </section>
  </div>
</template>
