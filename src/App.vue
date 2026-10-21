<script setup>
import { computed, onMounted, ref } from 'vue'
import { validateStep } from './lib/defect.js'
import { commitDraft, initStore, resetDraft, store } from './store.js'
import StepPhotos from './components/StepPhotos.vue'
import StepClassify from './components/StepClassify.vue'
import StepAssign from './components/StepAssign.vue'
import DoneView from './components/DoneView.vue'
import RecordList from './components/RecordList.vue'

const STEPS = [
  { n: 1, title: '拍照', icon: '📷', comp: StepPhotos },
  { n: 2, title: '位置分類', icon: '📍', comp: StepClassify },
  { n: 3, title: '說明指派', icon: '📝', comp: StepAssign },
]

const view = ref('wizard') // wizard | done | records | settings
const doneRecord = ref(null)
const missing = ref([])
const current = computed(() => STEPS[store.step - 1])
const openCount = computed(() => store.records.filter((r) => r.status === 'open').length)

onMounted(initStore)

function next() {
  missing.value = validateStep(store.step, store.draft)
  if (missing.value.length) return
  if (store.step < 3) {
    store.step++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else finish()
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

function startNew() {
  view.value = 'wizard'
  doneRecord.value = null
}

function openRecord(r) {
  doneRecord.value = r
  view.value = 'done'
}

function discardDraft() {
  if (confirm('確定要清除目前填寫的內容？')) resetDraft()
}
</script>

<template>
  <div v-if="store.ready" class="mx-auto flex min-h-dvh max-w-xl flex-col">
    <header class="sticky top-0 z-10 bg-slate-900 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] text-white">
      <div class="flex items-center justify-between">
        <div class="min-w-0">
          <div class="text-xs text-slate-400">工地缺失改善</div>
          <div class="truncate text-lg font-bold">{{ store.draft.projectName || store.settings.projectName || '尚未設定專案' }}</div>
        </div>
        <button class="rounded-xl bg-slate-700 px-3 py-2 text-sm" @click="view = 'settings'">⚙️ 設定</button>
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

    <main class="flex-1 px-4 py-5 pb-36">
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

      <section v-else-if="view === 'settings'" class="space-y-5">
        <div>
          <label class="label">預設工程專案</label>
          <input v-model="store.settings.projectName" class="input" placeholder="例：信義區住宅新建工程" />
        </div>
        <div>
          <label class="label">開單工程師姓名</label>
          <input v-model="store.settings.inspector" class="input" placeholder="會印在 PDF 上" />
        </div>
        <button class="btn btn-primary w-full" @click="(store.draft.projectName ||= store.settings.projectName), (view = 'wizard')">完成</button>
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
        <div class="mt-2 grid grid-cols-2 gap-2 text-sm font-semibold">
          <button class="rounded-xl py-2" :class="view === 'wizard' ? 'bg-amber-100 text-amber-900' : 'text-slate-500'" @click="view = 'wizard'">➕ 新增缺失</button>
          <button class="rounded-xl py-2" :class="view === 'records' ? 'bg-amber-100 text-amber-900' : 'text-slate-500'" @click="view = 'records'">
            📋 缺失紀錄 <span v-if="openCount" class="ml-1 rounded-full bg-red-500 px-2 text-white">{{ openCount }}</span>
          </button>
        </div>
      </div>
    </nav>
  </div>
</template>
