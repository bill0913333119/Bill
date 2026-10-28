<script setup>
import { computed, ref } from 'vue'
import { SEVERITIES } from '../data/presets.js'
import { findTrade, recommendContractor } from '../lib/defect.js'
import { setBuildings, setFloors, store } from '../store.js'
import CoachTip from './CoachTip.vue'
import ListEditor from './ListEditor.vue'

const trade = computed(() => findTrade(store.draft.tradeId, store.presets.trades))

function pickTrade(id) {
  const draft = store.draft
  if (draft.tradeId !== id) draft.item = ''
  draft.tradeId = id
  // 工種聯動：自動帶入對應分包商
  draft.contractorId = recommendContractor(id, store.presets.contractors)?.id ?? ''
}
const editing = ref('') // '' | 'buildings' | 'floors'
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
      <div class="mb-2 flex items-center justify-between">
        <label class="label !mb-0">棟別（選填）</label>
        <button class="rounded-lg bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700" @click="editing = 'buildings'">✏️ 編輯</button>
      </div>
      <div class="grid grid-cols-4 gap-2">
        <button v-for="b in store.settings.buildings" :key="b" class="chip px-1" :class="{ 'chip-on': store.draft.building === b }" @click="toggleBuilding(b)">{{ b }}</button>
      </div>
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between">
        <label class="label !mb-0">樓層 <span class="text-red-500">*</span></label>
        <button class="rounded-lg bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700" @click="editing = 'floors'">✏️ 編輯</button>
      </div>
      <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button v-for="f in store.settings.floors" :key="f" class="chip px-1" :class="{ 'chip-on': store.draft.floor === f }" @click="store.draft.floor = f">{{ f }}</button>
      </div>
    </div>

    <div>
      <label class="label">戶別／編號（選填）</label>
      <input v-model.trim="store.draft.unit" class="input" placeholder="例：301、A3、東側走廊" />
    </div>

    <div>
      <label class="label">缺失工種 <span class="text-red-500">*</span></label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="t in store.presets.trades"
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

    <ListEditor
      v-if="editing === 'buildings'"
      title="棟別"
      :items="store.settings.buildings"
      placeholder="輸入棟別，例：D棟（可用逗號一次多個）"
      @save="(l) => (setBuildings(l), (editing = ''))"
      @close="editing = ''"
    />
    <ListEditor
      v-if="editing === 'floors'"
      title="樓層"
      :items="store.settings.floors"
      placeholder="輸入樓層，例：16F 或 16F~20F"
      range-hint
      @save="(l) => (setFloors(l), (editing = ''))"
      @close="editing = ''"
    />
  </section>
</template>
