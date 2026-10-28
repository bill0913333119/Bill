<script setup>
// 棟別／樓層清單編輯：新增、刪除、重新命名、範圍批次新增。
import { ref } from 'vue'
import { addUnique, expandFloorInput } from '../lib/floors.js'

const props = defineProps({
  title: String,
  items: { type: Array, required: true },
  placeholder: String,
  rangeHint: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'close'])

const list = ref([...props.items])
const input = ref('')
const editing = ref(-1)
const editValue = ref('')

function add() {
  const values = props.rangeHint ? expandFloorInput(input.value) : input.value.split(/[,，、\n]/).map((v) => v.trim()).filter(Boolean)
  list.value = addUnique(list.value, values)
  input.value = ''
}
function startRename(i) {
  editing.value = i
  editValue.value = list.value[i]
}
function commitRename() {
  const v = editValue.value.trim()
  if (v && editing.value >= 0) list.value[editing.value] = v
  editing.value = -1
}
const remove = (i) => list.value.splice(i, 1)
const save = () => emit('save', [...new Set(list.value)])
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center" @click.self="emit('close')">
    <div class="flex max-h-[88dvh] w-full max-w-xl flex-col gap-3 rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-3xl">
      <h3 class="text-xl font-extrabold">✏️ 編輯{{ title }}</h3>
      <div class="flex gap-2">
        <input
          v-model="input"
          class="input"
          :placeholder="placeholder"
          @keydown.enter.prevent="add"
        />
        <button class="btn btn-primary shrink-0 px-5" :disabled="!input.trim()" @click="add">新增</button>
      </div>
      <p v-if="rangeHint" class="-mt-1 text-sm text-slate-500">可一次新增範圍，例：1F~20F、B3~B1</p>

      <ul class="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto">
        <li v-for="(it, i) in list" :key="it + i" class="flex items-center overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50">
          <input
            v-if="editing === i"
            v-model="editValue"
            class="min-w-0 flex-1 bg-white px-2 py-2 text-center text-lg font-semibold outline-none"
            autofocus
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
          />
          <button v-else class="min-w-0 flex-1 truncate px-2 py-2 text-lg font-semibold" @click="startRename(i)">{{ it }}</button>
          <button class="px-2 py-2 text-slate-400" :aria-label="`刪除 ${it}`" @click="remove(i)">✕</button>
        </li>
      </ul>
      <p class="text-sm text-slate-500">點名稱可改名，✕ 可刪除。已建立的缺失單不受影響。</p>

      <div class="grid grid-cols-2 gap-3">
        <button class="btn btn-ghost" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="save">儲存</button>
      </div>
    </div>
  </div>
</template>
