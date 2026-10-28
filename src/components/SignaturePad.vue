<script setup>
// 手寫簽名板：輸出去背 PNG，裁切到筆跡範圍，儲存後自動套用於日後所有通知單。
import { onMounted, ref } from 'vue'

const emit = defineEmits(['save', 'cancel'])
const canvas = ref()
const empty = ref(true)
let drawing = false
let last = null

const W = 600
const H = 240

function ctx() {
  return canvas.value.getContext('2d')
}

onMounted(() => {
  canvas.value.width = W
  canvas.value.height = H
  const c = ctx()
  c.lineWidth = 5
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.strokeStyle = '#0f172a'
})

function pos(e) {
  const r = canvas.value.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
}

function down(e) {
  canvas.value.setPointerCapture(e.pointerId)
  drawing = true
  last = pos(e)
  empty.value = false
  ctx().beginPath()
  ctx().arc(last.x, last.y, 2.5, 0, Math.PI * 2)
  ctx().fill()
}
function move(e) {
  if (!drawing) return
  const p = pos(e)
  const c = ctx()
  c.beginPath()
  c.moveTo(last.x, last.y)
  c.lineTo(p.x, p.y)
  c.stroke()
  last = p
}
const up = () => (drawing = false)

function clear() {
  ctx().clearRect(0, 0, W, H)
  empty.value = true
}

function save() {
  // 裁切到筆跡外框，避免 PDF 簽名欄留白過大
  const c = canvas.value
  const { data } = ctx().getImageData(0, 0, W, H)
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 20) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x)
        y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
    }
  }
  const pad = 8
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
  x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad)
  const out = document.createElement('canvas')
  out.width = x1 - x0
  out.height = y1 - y0
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  emit('save', out.toDataURL('image/png'))
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center">
    <div class="w-full max-w-xl space-y-3 rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-3xl">
      <h3 class="text-xl font-extrabold">✍️ 請在框內簽名</h3>
      <p class="text-sm text-slate-500">簽一次即可，之後所有通知單自動蓋上，不必重簽。</p>
      <canvas
        ref="canvas"
        class="w-full touch-none rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50"
        style="aspect-ratio: 600 / 240"
        @pointerdown.prevent="down"
        @pointermove.prevent="move"
        @pointerup="up"
        @pointercancel="up"
      ></canvas>
      <div class="grid grid-cols-3 gap-2">
        <button class="btn btn-ghost min-h-12 text-base" @click="emit('cancel')">取消</button>
        <button class="btn btn-ghost min-h-12 text-base" @click="clear">重寫</button>
        <button class="btn btn-primary min-h-12 text-base" :disabled="empty" @click="save">儲存簽名</button>
      </div>
    </div>
  </div>
</template>
