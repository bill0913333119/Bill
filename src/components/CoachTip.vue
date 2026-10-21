<script setup>
// 新人引導提示：每步驟顯示一句「現在要做什麼」，可永久關閉。
import { ref } from 'vue'

const props = defineProps({ id: String, text: String })
const key = `tip-hidden-${props.id}`
const hidden = ref(safeGet(key) === '1')

function safeGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function dismiss() {
  hidden.value = true
  try {
    localStorage.setItem(key, '1')
  } catch {}
}
</script>

<template>
  <div v-if="!hidden" class="mb-4 flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sky-900 ring-1 ring-sky-200">
    <span class="text-2xl">💡</span>
    <p class="flex-1 text-base leading-relaxed">{{ text }}</p>
    <button class="text-sm font-semibold text-sky-600" @click="dismiss">知道了</button>
  </div>
</template>
