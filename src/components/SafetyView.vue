<script setup>
// 工安中心：今日報到、審核派工、限期追蹤、工區管制、統計、設定。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as api from '../lib/api.js'
import { adoptServerRecord, store } from '../store.js'
import SafetyControl from './safety/SafetyControl.vue'
import SafetyReview from './safety/SafetyReview.vue'
import SafetySetup from './safety/SafetySetup.vue'
import SafetyStats from './safety/SafetyStats.vue'
import SafetyToday from './safety/SafetyToday.vue'
import SafetyTrack from './safety/SafetyTrack.vue'

const emit = defineEmits(['open', 'settings'])

const tab = ref('today')
const ov = ref(null)
const error = ref('')
const loading = ref(false)
let timer

const project = computed(() => store.settings.projectName)
const TABS = computed(() => [
  ['today', '今日'],
  ['review', `審核${ov.value?.pending.length ? `(${ov.value.pending.length})` : ''}`],
  ['track', '追蹤'],
  ['control', `管制${ov.value?.restrictions.filter((r) => !r.unlocked).length ? `(${ov.value.restrictions.filter((r) => !r.unlocked).length})` : ''}`],
  ['stats', '統計'],
  ['setup', '設定'],
])

async function load() {
  error.value = ''
  if (!project.value) return (error.value = '請先在「設定」填寫工程專案')
  if (!store.server.available) return (error.value = '工安功能需要連線雲端。目前為離線模式。')
  loading.value = true
  try {
    ov.value = await api.safetyOverview(project.value)
    for (const d of [...ov.value.pending, ...ov.value.active]) await adoptServerRecord(d)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function open(d) {
  emit('open', await adoptServerRecord(d))
}

onMounted(() => {
  load()
  timer = setInterval(() => document.visibilityState === 'visible' && load(), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-extrabold">🦺 工安中心</h2>
        <p class="text-sm text-slate-500">
          {{ ov?.date ?? '' }}・{{ store.server.role === 'safety' ? '安衛人員' : '工程師' }}
          <button v-if="store.server.safetyRoles && store.server.role !== 'safety'" class="underline" @click="emit('settings')">輸入安衛金鑰</button>
        </p>
      </div>
      <button class="text-sm font-semibold text-amber-700" :disabled="loading" @click="load">{{ loading ? '更新中…' : '🔄 更新' }}</button>
    </div>

    <div class="-mx-4 overflow-x-auto px-4">
      <div class="flex gap-2">
        <button
          v-for="[k, l] in TABS"
          :key="k"
          class="chip shrink-0 px-4 text-base"
          :class="{ 'chip-on': tab === k }"
          @click="tab = k"
        >
          {{ l }}
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">{{ error }}</p>

    <template v-else-if="ov">
      <SafetyToday v-if="tab === 'today'" :ov="ov" @go="tab = $event" />
      <SafetyReview v-else-if="tab === 'review'" :ov="ov" @refresh="load" @open="open" />
      <SafetyTrack v-else-if="tab === 'track'" :ov="ov" @open="open" />
      <SafetyControl v-else-if="tab === 'control'" :ov="ov" @refresh="load" @settings="emit('settings')" />
      <SafetyStats v-else-if="tab === 'stats'" :project="project" />
      <SafetySetup v-else-if="tab === 'setup'" :ov="ov" :project="project" @refresh="load" />
    </template>
    <p v-else-if="loading" class="py-12 text-center text-slate-500">載入中…</p>
  </section>
</template>
