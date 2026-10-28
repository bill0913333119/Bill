<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { validateStep } from './lib/defect.js'
import { needsReminder } from './lib/worklog.js'
import { commitDraft, connect, currentLog, initStore, pendingCount, resetDraft, store } from './store.js'
import StepPhotos from './components/StepPhotos.vue'
import StepClassify from './components/StepClassify.vue'
import StepAssign from './components/StepAssign.vue'
import DoneView from './components/DoneView.vue'
import RecordList from './components/RecordList.vue'
import ReplyView from './components/ReplyView.vue'
import SignaturePad from './components/SignaturePad.vue'
import WorkLogView from './components/WorkLogView.vue'

const STEPS = [
  { n: 1, title: '拍照', icon: '📷', comp: StepPhotos },
  { n: 2, title: '位置分類', icon: '📍', comp: StepClassify },
  { n: 3, title: '說明指派', icon: '📝', comp: StepAssign },
]

// 路由：#/reply/<token> 為廠商回報頁（獨立、免登入）；#/records 由 LINE 選單直達紀錄
const replyToken = location.hash.match(/^#\/reply\/([\w-]+)/)?.[1] ?? ''
const view = ref(location.hash === '#/records' ? 'records' : 'wizard') // wizard | done | records | worklog | settings
const doneRecord = ref(null)
const missing = ref([])
const signing = ref('') // '' | 'finish' | 'settings'
const now = ref(new Date())
let tick

const current = computed(() => STEPS[store.step - 1])
const openCount = computed(() => store.records.filter((r) => r.status !== 'closed').length)
const pending = computed(() => (store.ready ? pendingCount() : 0))
const logReminder = computed(() => store.ready && needsReminder(currentLog(), now.value, store.settings.reminderHour))
const logNotDone = computed(() => !currentLog()?.submittedAt)

onMounted(() => {
  if (replyToken) return
  initStore()
  tick = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => clearInterval(tick))

function next() {
  missing.value = validateStep(store.step, store.draft)
  if (missing.value.length) return
  if (store.step < 3) {
    store.step++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else if (!store.settings.signature) signing.value = 'finish' // 第一次使用：簽名一次，之後自動套用
  else finish()
}

function back() {
  missing.value = []
  if (store.step > 1) store.step--
}

async function finish() {
  doneRecord.value = await commitDraft()
  resetDraft()
  view.value = 'done'
}

function onSigned(dataUrl) {
  store.settings.signature = dataUrl
  const was = signing.value
  signing.value = ''
  if (was === 'finish') finish()
}

function startNew() {
  view.value = 'wizard'
  doneRecord.value = null
}

function openRecord(r) {
  doneRecord.value = r
  view.value = 'done'
}

function saveSettings() {
  store.draft.projectName ||= store.settings.projectName
  view.value = 'wizard'
  connect()
}

function discardDraft() {
  if (confirm('確定要清除目前填寫的內容？')) resetDraft()
}

const navBtn = (v) => (view.value === v ? 'bg-amber-100 text-amber-900' : 'text-slate-500')
</script>

<template>
  <ReplyView v-if="replyToken" :token="replyToken" />
  <div v-else-if="store.ready" class="mx-auto flex min-h-dvh max-w-xl flex-col">
    <header class="sticky top-0 z-10 bg-slate-900 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] text-white">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs text-slate-400">工地缺失改善</div>
          <div class="truncate text-lg font-bold">{{ store.draft.projectName || store.settings.projectName || '尚未設定專案' }}</div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span v-if="!store.online" class="rounded-lg bg-red-500/90 px-2 py-1 text-xs font-bold">📴 離線</span>
          <span v-if="pending" class="rounded-lg bg-amber-500 px-2 py-1 text-xs font-bold text-slate-900">待同步 {{ pending }}</span>
          <button class="rounded-xl bg-slate-700 px-3 py-2 text-sm" @click="view = 'settings'">⚙️ 設定</button>
        </div>
      </div>

      <ol v-if="view === 'wizard'" class="mt-3 grid grid-cols-3 gap-2">
        <li
          v-for="s in STEPS"
          :key="s.n"
          class="rounded-xl py-2 text-center text-sm font-bold"
          :class="s.n === store.step ? 'bg-amber-500 text-slate-900' : s.n < store.step ? 'bg-slate-600' : 'bg-slate-800 text-slate-500'"
        >
          {{ s.n < store.step ? '✓' : s.icon }} {{ s.n }}. {{ s.title }}
        </li>
      </ol>
    </header>

    <button v-if="logReminder && view !== 'worklog'" class="bg-red-600 px-4 py-3 text-left font-bold text-white" @click="view = 'worklog'">
      ⏰ 尚未送出今日工作日誌，填完才能下班簽退 ➜
    </button>

    <main class="flex-1 px-4 py-5 pb-40">
      <template v-if="view === 'wizard'">
        <component :is="current.comp" />
        <div v-if="missing.length" class="mt-5 rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">
          ⚠️ 還差：{{ missing.join('、') }}
        </div>
        <div class="mt-6 flex items-center justify-between text-sm text-slate-400">
          <span>{{ store.savedAt ? '✔ 已自動暫存' : '' }}</span>
          <button class="underline" @click="discardDraft">清除重填</button>
        </div>
      </template>

      <DoneView v-else-if="view === 'done' && doneRecord" :key="doneRecord.id" :record="doneRecord" @new="startNew" @close="view = 'records'" />

      <RecordList v-else-if="view === 'records'" @open="openRecord" />

      <WorkLogView v-else-if="view === 'worklog'" @settings="view = 'settings'" />

      <section v-else-if="view === 'settings'" class="space-y-5">
        <div>
          <label class="label" for="proj">預設工程專案</label>
          <input id="proj" v-model="store.settings.projectName" class="input" list="settings-project-options" placeholder="例：六張犁" />
          <datalist id="settings-project-options">
            <option v-for="p in store.presets.projects" :key="p" :value="p" />
          </datalist>
        </div>
        <div>
          <label class="label" for="insp">開單工程師姓名</label>
          <input id="insp" v-model="store.settings.inspector" class="input" placeholder="會印在 PDF 與日誌上" />
        </div>

        <div>
          <label class="label">我的簽名</label>
          <div class="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center">
            <img v-if="store.settings.signature" :src="store.settings.signature" class="mx-auto max-h-20" alt="已儲存的簽名" />
            <p v-else class="text-slate-500">尚未簽名。第一次產出通知單時也會請你簽名。</p>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button class="btn btn-ghost min-h-12 text-base" @click="signing = 'settings'">✍️ {{ store.settings.signature ? '重新簽名' : '簽名' }}</button>
            <button class="btn btn-ghost min-h-12 text-base" :disabled="!store.settings.signature" @click="store.settings.signature = ''">刪除簽名</button>
          </div>
          <p class="mt-1 text-sm text-slate-500">簽名只存在這支手機，之後所有通知單自動蓋上。</p>
        </div>

        <div>
          <label class="label" for="rh">下班提醒時間</label>
          <select id="rh" v-model.number="store.settings.reminderHour" class="input">
            <option v-for="h in [15, 16, 17, 18, 19]" :key="h" :value="h">{{ h }}:00 起未填日誌即提醒</option>
          </select>
        </div>

        <div v-if="store.server.authRequired || store.settings.apiToken">
          <label class="label" for="tok">雲端連線金鑰</label>
          <input id="tok" v-model.trim="store.settings.apiToken" type="password" class="input" placeholder="向系統管理員索取" />
        </div>
        <p class="text-sm text-slate-500">
          {{ store.server.available ? '☁️ 已連線雲端，資料會自動同步' : '📴 目前為離線模式，資料存在本機，連線後自動上傳' }}
          {{ store.server.error ? `（${store.server.error}）` : '' }}
        </p>
        <button class="btn btn-primary w-full" @click="saveSettings">完成</button>
      </section>
    </main>

    <!-- 底部固定操作列：單手拇指可及 -->
    <nav class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
      <div class="mx-auto max-w-xl">
        <div v-if="view === 'wizard'" class="flex gap-3">
          <button v-if="store.step > 1" class="btn btn-ghost w-28" @click="back">上一步</button>
          <button class="btn btn-primary flex-1" @click="next">
            {{ store.step < 3 ? '下一步 ➜' : '✅ 完成並產出 PDF' }}
          </button>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-sm font-semibold">
          <button class="rounded-xl py-2" :class="navBtn('wizard')" @click="view = 'wizard'">➕ 新增缺失</button>
          <button class="rounded-xl py-2" :class="navBtn('records')" @click="view = 'records'">
            📋 紀錄 <span v-if="openCount" class="ml-1 rounded-full bg-red-500 px-2 text-white">{{ openCount }}</span>
          </button>
          <button class="rounded-xl py-2" :class="navBtn('worklog')" @click="view = 'worklog'">
            📒 日誌 <span v-if="logNotDone" class="ml-1 inline-block h-2.5 w-2.5 rounded-full" :class="logReminder ? 'bg-red-500' : 'bg-amber-400'"></span>
          </button>
        </div>
      </div>
    </nav>

    <SignaturePad v-if="signing" @save="onSigned" @cancel="signing = ''" />
  </div>
</template>
