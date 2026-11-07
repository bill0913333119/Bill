<script setup>
// 第一次掃碼：登錄身分、所屬工班與證照。之後每天報到不用再填。
import { computed, reactive, ref } from 'vue'
import { LICENSE_TYPES, WORKER_ROLES, validateWorker } from '../../shared/safety.js'

const props = defineProps({
  info: { type: Object, required: true },
  initial: { type: Object, default: null }, // 有值時為「修改資料」
  busy: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'cancel'])

const editing = computed(() => Boolean(props.initial))
const form = reactive({
  name: props.initial?.name ?? '',
  phone: props.initial?.phone ?? '',
  contractorId: props.initial?.contractorId ?? '',
  role: props.initial?.role ?? 'worker',
  insuranceOk: props.initial?.insuranceOk ?? false,
  trainingUntil: props.initial?.trainingUntil ?? '',
  licenses: (props.initial?.licenses ?? []).map((l) => ({
    preset: LICENSE_TYPES.includes(l.type) ? l.type : '其他',
    custom: LICENSE_TYPES.includes(l.type) ? '' : l.type,
    until: l.until ?? '',
  })),
})
const missing = ref([])

const addLicense = () => form.licenses.push({ preset: LICENSE_TYPES[0], custom: '', until: '' })

function submit() {
  const body = {
    name: form.name.trim(),
    phone: form.phone,
    contractorId: form.contractorId,
    role: form.role,
    insuranceOk: form.insuranceOk,
    trainingUntil: form.trainingUntil,
    licenses: form.licenses.map((l) => ({ type: l.preset === '其他' ? l.custom.trim() : l.preset, until: l.until })),
  }
  missing.value = validateWorker(body)
  if (!body.insuranceOk) missing.value.push('勞保（或職災保險）投保確認')
  if (!body.trainingUntil) missing.value.push('安衛教育訓練效期')
  if (missing.value.length) return
  emit('submit', body)
}
</script>

<template>
  <section class="space-y-5">
    <div class="rounded-2xl bg-sky-50 p-4 text-sky-900 ring-1 ring-sky-200">
      <p class="text-lg font-bold">{{ editing ? '✏️ 修改我的資料' : '👋 第一次進場，請登錄資料' }}</p>
      <p class="mt-1 text-base leading-relaxed">
        {{ editing ? '修改工班、身分或證照後，需工務所重新核驗。' : '只要填一次，之後每天掃 QR Code 就能直接報到。資料僅供本工地進場與工安管理使用。' }}
      </p>
    </div>

    <div>
      <label class="label" for="w-name">姓名 <span class="text-red-500">*</span></label>
      <input id="w-name" v-model="form.name" class="input" autocomplete="name" placeholder="王小明" />
    </div>
    <div>
      <label class="label" for="w-phone">手機號碼 <span class="text-red-500">*</span></label>
      <input id="w-phone" v-model="form.phone" class="input" type="tel" inputmode="tel" :disabled="editing" placeholder="0912345678" />
      <p v-if="editing" class="mt-1 text-sm text-slate-500">手機號碼即帳號，無法修改</p>
    </div>
    <div>
      <label class="label" for="w-contractor">所屬分包商／工班 <span class="text-red-500">*</span></label>
      <select id="w-contractor" v-model="form.contractorId" class="input">
        <option value="" disabled>請選擇</option>
        <option v-for="c in info.contractors" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <p class="mt-1 text-sm text-slate-500">清單裡沒有你的工班，請洽工務所新增</p>
    </div>
    <div>
      <label class="label">身分 <span class="text-red-500">*</span></label>
      <div class="grid grid-cols-3 gap-2">
        <button v-for="r in WORKER_ROLES" :key="r.id" type="button" class="chip px-1" :class="{ 'chip-on': form.role === r.id }" @click="form.role = r.id">
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <h3 class="text-lg font-extrabold">🪪 進場資格</h3>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left text-lg font-semibold"
        :class="form.insuranceOk ? 'border-green-500 bg-green-50 text-green-900' : 'border-slate-200 bg-white text-slate-700'"
        @click="form.insuranceOk = !form.insuranceOk"
      >
        <span class="text-2xl">{{ form.insuranceOk ? '✅' : '⬜' }}</span>我已投保勞保（或職災保險）
      </button>
      <div>
        <label class="label" for="w-training">安衛教育訓練有效期限 <span class="text-red-500">*</span></label>
        <input id="w-training" v-model="form.trainingUntil" type="date" class="input" />
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <span class="label !mb-0">特殊作業證照（選填）</span>
          <button type="button" class="rounded-lg bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700" :disabled="form.licenses.length >= 10" @click="addLicense">
            ＋ 新增證照
          </button>
        </div>
        <p v-if="!form.licenses.length" class="text-sm text-slate-500">例如高空工作車、施工架組配、吊掛作業</p>
        <div v-for="(l, i) in form.licenses" :key="i" class="mb-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div class="flex gap-2">
            <select v-model="l.preset" class="input" :aria-label="`證照 ${i + 1} 名稱`">
              <option v-for="t in LICENSE_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
            <button type="button" class="shrink-0 px-2 text-xl text-slate-400" :aria-label="`刪除證照 ${i + 1}`" @click="form.licenses.splice(i, 1)">✕</button>
          </div>
          <input v-if="l.preset === '其他'" v-model="l.custom" class="input" placeholder="證照名稱" />
          <label class="flex items-center gap-2 text-sm text-slate-600">
            有效期限 <input v-model="l.until" type="date" class="input min-h-10 flex-1" />
          </label>
        </div>
      </div>
    </div>

    <div v-if="missing.length" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">⚠️ 還差：{{ missing.join('、') }}</div>
    <p v-if="error" class="rounded-2xl bg-red-50 p-4 text-red-700 ring-1 ring-red-200">{{ error }}</p>

    <button class="btn btn-primary w-full min-h-16 text-2xl" :disabled="busy" @click="submit">
      {{ busy ? '送出中…' : editing ? '💾 儲存' : '✅ 完成登錄' }}
    </button>
    <button v-if="editing" class="w-full py-3 text-slate-500" @click="emit('cancel')">取消</button>
  </section>
</template>
