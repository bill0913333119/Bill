<script setup>
// 工人端（掃工地入口 QR Code 開啟）：進場報到、工安隨手拍／匿名吹哨、工班待改善、工安點數。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BUILDINGS, FLOORS } from '../data/presets.js'
import { SLA, remainingText, roleLabel, siteDate, siteTime, zoneLabel } from '../../shared/safety.js'
import { initLiff, lineUserId } from '../lib/liff.js'
import { setWorkerToken, site, worker as api } from './api.js'
import * as local from './local.js'
import { flushOutbox } from './submit.js'
import WorkerCheckin from './WorkerCheckin.vue'
import WorkerMine from './WorkerMine.vue'
import WorkerRegister from './WorkerRegister.vue'
import WorkerReport from './WorkerReport.vue'
import WorkerTasks from './WorkerTasks.vue'

const props = defineProps({ siteKey: { type: String, required: true } })

const view = ref('loading') // loading | error | register | home | checkin | report | reported | tasks | mine | edit
const info = ref(null)
const me = ref(null)
const tasks = ref(null)
const fatal = ref('')
const busy = ref(false)
const formError = ref('')
const reportMode = ref('named')
const lastReport = ref(null)
const outboxCount = ref(0)
const notice = ref('')
const confirmLogout = ref(false)
const showHazards = ref(false)
const now = ref(new Date())
let tick

const buildings = computed(() => info.value?.buildings ?? BUILDINGS)
const floors = computed(() => info.value?.floors ?? FLOORS)
const w = computed(() => me.value?.worker)
const isLeader = computed(() => w.value && w.value.role !== 'worker')
// 離線時用的是上次快取的資料：不是今天的報到就不算
const todayCheckin = computed(() => (me.value?.date === siteDate(now.value) ? me.value.checkin : null))
// 報到後才通過核驗：不再顯示當時的「尚未核驗」提醒
const checkinWarnings = computed(() =>
  (todayCheckin.value?.warnings ?? []).filter((x) => !(w.value?.verifiedAt && x.startsWith('身分與證照尚未經工務所核驗'))),
)
const urgent = computed(() => tasks.value?.tasks?.filter((t) => t.status === 'open') ?? [])

async function loadInfo() {
  try {
    info.value = await site.info(props.siteKey)
    await local.saveSiteInfo(props.siteKey, info.value)
  } catch (e) {
    if (e.status === 404) throw e
    info.value = await local.loadSiteInfo(props.siteKey) // 沒網路：用上次的工地資料
    if (!info.value) throw e
  }
}

async function loadMe() {
  try {
    me.value = await api.me()
    await local.saveAuth(props.siteKey, { ...(await local.loadAuth(props.siteKey)), me: me.value })
  } catch (e) {
    if (e.status === 401) {
      await local.clearAuth(props.siteKey)
      setWorkerToken('')
      me.value = null
      return
    }
    me.value = (await local.loadAuth(props.siteKey))?.me ?? null // 沒網路：用上次的資料
  }
  if (me.value && isLeader.value) api.tasks().then((t) => (tasks.value = t), () => {})
}

/** 在 LINE 內開啟：綁定 LINE，派工時可個人推播給工班長。 */
async function linkLine() {
  if (!info.value?.liffId) return
  await initLiff(info.value.liffId)
  const uid = await lineUserId()
  if (uid && w.value && !w.value.hasLine) {
    const { name, phone, contractorId, role, insuranceOk, trainingUntil, licenses } = w.value
    await api.update({ name, phone, contractorId, role, insuranceOk, trainingUntil, licenses, lineUserId: uid }).catch(() => {})
  }
}

async function syncOutbox() {
  const r = await flushOutbox(props.siteKey).catch(() => null)
  outboxCount.value = (await local.loadOutbox(props.siteKey)).length
  if (r?.sent) notice.value = `📤 已補送 ${r.sent} 件暫存的通報`
  if (r?.failed.length) notice.value = `⚠️ ${r.failed.length} 件通報無法送出：${r.failed[0]}`
}

async function boot() {
  try {
    await loadInfo()
    const auth = await local.loadAuth(props.siteKey)
    if (auth?.token) {
      setWorkerToken(auth.token)
      await loadMe()
    }
    view.value = me.value ? 'home' : 'register'
    linkLine()
    syncOutbox()
  } catch (e) {
    fatal.value = e.status === 404 ? e.message : `無法連線：${e.message}`
    view.value = 'error'
  }
}

async function register(body) {
  busy.value = true
  formError.value = ''
  try {
    const { token } = await site.register(props.siteKey, { ...body, lineUserId: (await lineUserId()) ?? undefined })
    await local.saveAuth(props.siteKey, { token })
    setWorkerToken(token)
    await loadMe()
    view.value = 'home'
    notice.value = '✅ 登錄完成！請完成今日進場報到'
  } catch (e) {
    formError.value = e.message
  } finally {
    busy.value = false
  }
}

async function saveProfile(body) {
  busy.value = true
  formError.value = ''
  try {
    await api.update(body)
    await loadMe()
    view.value = 'home'
    notice.value = '✅ 資料已更新'
  } catch (e) {
    formError.value = e.message
  } finally {
    busy.value = false
  }
}

async function onCheckedIn() {
  await loadMe()
  view.value = 'home'
  notice.value = '✅ 報到完成，注意安全！'
}

function openReport(mode) {
  reportMode.value = mode
  view.value = 'report'
}

async function onReported(r) {
  lastReport.value = r
  view.value = 'reported'
  outboxCount.value = (await local.loadOutbox(props.siteKey)).length
  if (!r.queued && r.kind === 'named') loadMe()
}

async function logout() {
  await local.clearAuth(props.siteKey)
  setWorkerToken('')
  me.value = null
  confirmLogout.value = false
  view.value = 'register'
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    notice.value = '已複製回執碼'
  } catch {
    notice.value = '請長按回執碼複製'
  }
}

const go = (v) => {
  notice.value = ''
  formError.value = ''
  view.value = v
  window.scrollTo({ top: 0 })
}

onMounted(() => {
  boot()
  window.addEventListener('online', syncOutbox)
  tick = setInterval(() => (now.value = new Date()), 30_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', syncOutbox)
  clearInterval(tick)
})
</script>

<template>
  <div class="mx-auto min-h-dvh max-w-xl bg-slate-100">
    <header v-if="view !== 'tasks'" class="sticky top-0 z-10 bg-slate-900 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] text-white">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs text-slate-400">工人進場報到・工安通報</div>
          <div class="truncate text-lg font-bold">{{ info?.project.name ?? '載入中…' }}</div>
        </div>
        <div v-if="w" class="shrink-0 text-right text-sm">
          <div class="font-bold">{{ w.name }}</div>
          <div class="text-slate-400">{{ roleLabel(w.role) }}</div>
        </div>
      </div>
    </header>

    <main class="px-4 py-5">
      <p v-if="view === 'loading'" class="py-20 text-center text-lg text-slate-500">載入中…</p>

      <div v-else-if="view === 'error'" class="rounded-2xl bg-red-50 p-6 text-center text-lg text-red-700">
        <div class="text-5xl">⚠️</div>
        <p class="mt-2">{{ fatal }}</p>
      </div>

      <WorkerRegister v-else-if="view === 'register'" :info="info" :busy="busy" :error="formError" @submit="register" />
      <WorkerRegister v-else-if="view === 'edit'" :info="info" :initial="w" :busy="busy" :error="formError" @submit="saveProfile" @cancel="go('home')" />

      <WorkerCheckin
        v-else-if="view === 'checkin'"
        :me="me"
        :buildings="buildings"
        :floors="floors"
        @done="onCheckedIn"
        @cancel="go('home')"
        @edit-profile="go('edit')"
      />

      <WorkerReport
        v-else-if="view === 'report'"
        :site-key="siteKey"
        :project-name="info.project.name"
        :buildings="buildings"
        :floors="floors"
        :checkin="todayCheckin"
        :mode="reportMode"
        @done="onReported"
        @cancel="go('home')"
        @checkin="go('checkin')"
      />

      <WorkerTasks v-else-if="view === 'tasks'" @back="(go('home'), loadMe())" />
      <WorkerMine v-else-if="view === 'mine'" :site-key="siteKey" :signed-in="Boolean(w)" @back="go('home')" />

      <!-- 通報結果 -->
      <section v-else-if="view === 'reported' && lastReport" class="space-y-4">
        <div class="rounded-3xl bg-white p-6 text-center shadow">
          <div class="text-6xl">{{ lastReport.queued ? '📥' : '✅' }}</div>
          <h2 class="mt-2 text-2xl font-extrabold">
            {{ lastReport.queued ? '已暫存在手機' : lastReport.kind === 'whistle' ? '已匿名送出' : '已通報' }}
          </h2>
          <p v-if="lastReport.queued" class="mt-2 text-slate-600">目前沒有網路，連上網路後會自動送出。</p>
          <template v-else-if="lastReport.kind === 'named'">
            <p class="mt-1 text-lg text-slate-600">{{ lastReport.result.reportNo }}</p>
            <p v-if="lastReport.result.status === 'open'" class="mt-3 rounded-2xl bg-green-50 p-4 text-left text-green-900">
              已通知 <b>{{ lastReport.result.contractorName }}</b>{{ lastReport.result.notified.length ? `（${lastReport.result.notified.join('、')}）` : '' }}，
              限 <b>{{ siteTime(lastReport.result.dueAt) }}</b> 前改善。改善銷案後你會得到工安點數。
            </p>
            <p v-else class="mt-3 rounded-2xl bg-amber-50 p-4 text-left text-amber-900">已送交工務所，將盡快指派責任工班。</p>
          </template>
          <template v-else>
            <p class="mt-3 text-slate-600">你的回執碼（可查詢處理進度）：</p>
            <button class="mt-2 w-full rounded-2xl bg-violet-50 p-4 font-mono text-2xl font-bold tracking-wider text-violet-900" @click="copy(lastReport.result.receipt)">
              {{ lastReport.result.receipt }}
            </button>
            <p class="mt-2 text-sm text-slate-500">回執碼也存在「我的通報」裡，可隨時清除。</p>
          </template>
        </div>
        <button class="btn btn-primary w-full" @click="openReport(lastReport.kind)">再通報一件</button>
        <button class="btn btn-ghost w-full" @click="go('home')">回首頁</button>
      </section>

      <!-- 首頁 -->
      <section v-else-if="view === 'home' && w" class="space-y-4">
        <p v-if="notice" class="rounded-2xl bg-green-50 p-4 font-semibold text-green-800 ring-1 ring-green-200">{{ notice }}</p>
        <p v-if="outboxCount" class="rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          📥 有 {{ outboxCount }} 件通報暫存在手機，連上網路會自動送出。
        </p>

        <div v-if="todayCheckin" class="rounded-3xl bg-green-600 p-5 text-white shadow">
          <div class="text-sm font-bold opacity-90">今日已報到 {{ siteTime(todayCheckin.updatedAt) }}</div>
          <div class="mt-1 text-2xl font-extrabold">✅ {{ zoneLabel(todayCheckin) }}</div>
          <div class="text-sm opacity-90">{{ w.contractorName }}{{ todayCheckin.heightWork ? '・🪜 高處作業' : '' }}</div>
          <ul v-if="checkinWarnings.length" class="mt-3 space-y-1 rounded-xl bg-white/15 p-3 text-sm">
            <li v-for="x in checkinWarnings" :key="x">⚠️ {{ x }}</li>
          </ul>
          <button class="mt-3 text-sm underline" @click="go('checkin')">變更今日工區（重新報到）</button>
        </div>
        <button v-else class="btn btn-primary w-full min-h-28 flex-col text-2xl" @click="go('checkin')">
          <span class="text-5xl">🪪</span>開始今日進場報到
          <span class="text-sm font-semibold">資格檢核 → 危害告知 → 防護具 → 危險交接</span>
        </button>

        <div class="grid grid-cols-2 gap-3">
          <button class="btn btn-line min-h-32 flex-col text-xl" @click="openReport('named')">
            <span class="text-4xl">📷</span>工安隨手拍<span class="text-xs font-semibold">具名・可得點數</span>
          </button>
          <button class="btn min-h-32 flex-col bg-violet-700 text-xl text-white" @click="openReport('whistle')">
            <span class="text-4xl">🕵️</span>匿名吹哨<span class="text-xs font-semibold">不留身分</span>
          </button>
        </div>

        <button v-if="isLeader" class="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm" @click="go('tasks')">
          <span class="text-4xl">🛠️</span>
          <span class="min-w-0 flex-1">
            <span class="block text-lg font-extrabold">本工班待改善 {{ tasks?.allowed ? urgent.length : '' }}</span>
            <span v-if="tasks && !tasks.allowed" class="block text-sm text-amber-700">{{ tasks.reason }}</span>
            <span v-else-if="urgent[0]" class="block text-sm font-bold" :class="remainingText(urgent[0].dueAt, now).overdue ? 'text-red-600' : 'text-slate-600'">
              最急：{{ SLA[urgent[0].severity].level }}級 {{ urgent[0].item }}・{{ remainingText(urgent[0].dueAt, now).text }}
            </span>
            <span v-else class="block text-sm text-slate-500">同角度拍照回報改善</span>
          </span>
          <span class="text-2xl text-slate-400">›</span>
        </button>

        <button class="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm" @click="go('mine')">
          <span class="text-4xl">⭐</span>
          <span class="flex-1">
            <span class="block text-lg font-extrabold">我的工安點數 {{ me.points }}</span>
            <span class="block text-sm text-slate-500">通報進度、匿名回執查詢</span>
          </span>
          <span class="text-2xl text-slate-400">›</span>
        </button>

        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <button class="flex w-full items-center justify-between text-left font-bold" @click="showHazards = !showHazards">
            <span>📢 今日危害告知</span><span>{{ showHazards ? '▲' : '▼' }}</span>
          </button>
          <ul v-if="showHazards" class="mt-3 space-y-2 text-base leading-relaxed">
            <li v-for="(h, i) in info.hazards.items" :key="i">⚠️ {{ h }}</li>
          </ul>
        </div>

        <div class="flex items-center justify-between rounded-2xl bg-white p-4 text-sm shadow-sm">
          <span :class="w.verifiedAt ? 'text-green-700' : 'text-amber-700'">{{ w.verifiedAt ? '✔ 已經工務所核驗' : '⏳ 尚未經工務所核驗' }}</span>
          <button class="font-semibold text-amber-700" @click="go('edit')">✏️ 修改資料</button>
        </div>
        <div class="text-center text-sm text-slate-500">
          <button v-if="!confirmLogout" class="underline" @click="confirmLogout = true">換人使用這支手機</button>
          <span v-else>
            登出後需重新登錄。
            <button class="font-bold text-red-600 underline" @click="logout">確定登出</button>
            <button class="ml-2 underline" @click="confirmLogout = false">取消</button>
          </span>
        </div>
      </section>
    </main>
  </div>
</template>
