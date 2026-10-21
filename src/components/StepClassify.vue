<script setup>
import { computed } from 'vue'
import { BUILDINGS, FLOORS, SEVERITIES, TRADES } from '../data/presets.js'
import { findTrade, recommendContractor } from '../lib/defect.js'
import { store } from '../store.js'
import CoachTip from './CoachTip.vue'

const trade = computed(() => findTrade(store.draft.tradeId))

function pickTrade(id) {
  const draft = store.draft
  if (draft.tradeId !== id) draft.item = ''
  draft.tradeId = id
  // 工種聯動：自動帶入對應分包商
  draft.contractorId = recommendContractor(id)?.id ?? ''
}
const toggleBuilding = (b) => (store.draft.building = store.draft.building === b ? '' : b)
</script>

<template>
  <section class="space-y-6">
    <CoachTip id="classify" text="依序點選：樓層 → 工種 → 常見項目。全部用點的，不需要打字。" />

    <div>
      <label class="label">工程專案</label>
      <input v-model="store.draft.projectName" class="input" placeholder="例：信義區住宅新建工程" />
    </div>

    <div>
      <label class="label">棟別（選填）</label>
      <div class="grid grid-cols-4 gap-2">
        <button v-for="b in BUILDINGS" :key="b" class="chip" :class="{ 'chip-on': store.draft.building === b }" @click="toggleBuilding(b)">{{ b }}</button>
      </div>
    </div>

    <div>
      <label class="label">樓層 <span class="text-red-500">*</span></label>
      <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button v-for="f in FLOORS" :key="f" class="chip" :class="{ 'chip-on': store.draft.floor === f }" @click="store.draft.floor = f">{{ f }}</button>
      </div>
    </div>

    <div>
      <label class="label">缺失工種 <span class="text-red-500">*</span></label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="t in TRADES"
          :key="t.id"
          class="chip flex min-h-24 flex-col items-center justify-center gap-1"
          :class="{ 'chip-on': store.draft.tradeId === t.id }"
          @click="pickTrade(t.id)"
        >
          <span class="text-4xl">{{ t.icon }}</span>{{ t.label }}
        </button>
      </div>
    </div>

    <div v-if="trade">
      <label class="label">缺失項目 <span class="text-red-500">*</span></label>
      <div class="flex flex-wrap gap-2">
        <button v-for="it in trade.items" :key="it" class="chip" :class="{ 'chip-on': store.draft.item === it }" @click="store.draft.item = it">{{ it }}</button>
      </div>
      <input v-model="store.draft.item" class="input mt-3" placeholder="或自行輸入項目" />
    </div>

    <div>
      <label class="label">缺失嚴重度</label>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="s in SEVERITIES"
          :key="s.id"
          class="chip min-h-14 text-xl"
          :class="[store.draft.severity === s.id && (s.id === 'major' ? 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-300' : 'chip-on')]"
          @click="store.draft.severity = s.id"
        >
          {{ s.icon }} {{ s.label }}
        </button>
      </div>
    </div>
  </section>
</template>
