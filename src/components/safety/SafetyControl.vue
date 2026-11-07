<script setup>
// 隔日工區管制：前一日以前開立、尚未銷案的 A 級缺失，責任工班隔日不得在該工區報到；安衛人員會同確認後當日解鎖。
import { ref } from 'vue'
import { locationText, siteTime } from '../../../shared/safety.js'
import * as api from '../../lib/api.js'
import { store } from '../../store.js'

defineProps({ ov: { type: Object, required: true } })
const emit = defineEmits(['refresh', 'settings'])

const editing = ref('')
const note = ref('')
const busy = ref(false)
const error = ref('')

async function unlock(d) {
  error.value = ''
  if (!note.value.trim()) return (error.value = '請填寫會同確認的安全措施')
  busy.value = true
  try {
    await api.unlockDefect(d.id, note.value.trim(), store.settings.inspector)
    editing.value = ''
    note.value = ''
    emit('refresh')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <p class="rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
      規則：工班有<b>前一日以前開立</b>、尚未銷案的 A 級缺失，該工班人員隔日不能在那個工區報到；安衛人員到現場確認安全措施後，按「解鎖」當天即可報到。
    </p>
    <p v-if="store.server.role !== 'safety'" class="rounded-2xl bg-violet-50 p-3 text-violet-900">
      🔒 解鎖限安衛人員。<button class="underline" @click="emit('settings')">輸入安衛金鑰</button>
    </p>
    <p v-if="!ov.restrictions.length" class="rounded-2xl bg-green-50 p-6 text-center text-lg font-bold text-green-800">👍 目前沒有工區管制</p>
    <ul class="space-y-3">
      <li v-for="d in ov.restrictions" :key="d.id" class="space-y-2 rounded-2xl bg-white p-4 shadow-sm" :class="{ 'ring-2 ring-red-400': !d.unlocked }">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm text-slate-500">{{ d.reportNo }}・開立 {{ siteTime(d.createdAt) }}</div>
            <div class="font-bold">{{ locationText(d) }}｜{{ d.item }}</div>
            <div class="text-sm">管制工班：<b>{{ d.contractorName || '未指派' }}</b></div>
          </div>
          <span class="shrink-0 rounded-lg px-2 py-1 text-sm font-bold" :class="d.unlocked ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'">
            {{ d.unlocked ? '今日已解鎖' : '⛔ 管制中' }}
          </span>
        </div>
        <template v-if="!d.unlocked && store.server.role === 'safety'">
          <button v-if="editing !== d.id" class="btn btn-ghost min-h-12 w-full text-base" @click="((editing = d.id), (note = ''))">🔓 會同確認並解鎖</button>
          <div v-else class="space-y-2">
            <textarea v-model="note" rows="2" class="input py-2" placeholder="例：已會同工班長確認臨時護欄恢復，今日可進場" aria-label="會同確認內容"></textarea>
            <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
            <div class="grid grid-cols-2 gap-2">
              <button class="btn btn-ghost min-h-12 text-base" @click="editing = ''">取消</button>
              <button class="btn btn-primary min-h-12 text-base" :disabled="busy" @click="unlock(d)">確認解鎖</button>
            </div>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
