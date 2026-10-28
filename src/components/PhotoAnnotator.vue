<script setup>
// 照片標註：紅圈、箭頭、任意塗鴉。完成後輸出合成後的 JPEG，直接用於 PDF。
import { onMounted, ref } from 'vue'
import { drawStroke } from '../lib/draw.js'

const props = defineProps({ src: { type: String, required: true } })
const emit = defineEmits(['save', 'cancel'])

const TOOLS = [
  { id: 'circle', icon: '⭕', label: '圓圈' },
  { id: 'arrow', icon: '➡️', label: '箭頭' },
  { id: 'pen', icon: '✏️', label: '塗鴉' },
]
const COLORS = ['#ef4444', '#facc15', '#ffffff', '#111827']

const canvas = ref()
const tool = ref('circle')
const color = ref(COLORS[0])
const strokes = ref([])
let img = null
let current = null

const lineWidth = () => Math.max(4, Math.round(canvas.value.width / 160))

function redraw() {
  const c = canvas.value
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, c.width, c.height)
  for (const s of strokes.value) drawStroke(ctx, s, lineWidth())
  if (current) drawStroke(ctx, current, lineWidth())
}

function point(e) {
  const rect = canvas.value.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.value.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.value.height,
  }
}

function down(e) {
  canvas.value.setPointerCapture(e.pointerId)
  const p = point(e)
  current = { tool: tool.value, color: color.value, points: tool.value === 'pen' ? [p] : [p, p] }
  redraw()
}
function move(e) {
  if (!current) return
  const p = point(e)
  if (current.tool === 'pen') current.points.push(p)
  else current.points[1] = p
  redraw()
}
function up() {
  if (!current) return
  const [a, b] = current.points
  const tiny = current.tool !== 'pen' && Math.hypot(b.x - a.x, b.y - a.y) < 8
  if (!tiny) strokes.value.push(current)
  current = null
  redraw()
}

const undo = () => {
  strokes.value.pop()
  redraw()
}
const clear = () => {
  strokes.value = []
  redraw()
}
const save = () => emit('save', canvas.value.toDataURL('image/jpeg', 0.88))

onMounted(() => {
  img = new Image()
  img.onload = () => {
    canvas.value.width = img.naturalWidth
    canvas.value.height = img.naturalHeight
    redraw()
  }
  img.src = props.src
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black">
    <div class="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] text-white">
      <button class="px-2 py-2 text-lg" @click="emit('cancel')">取消</button>
      <span class="font-bold">在照片上標註缺失位置</span>
      <button class="rounded-xl bg-amber-500 px-4 py-2 text-lg font-bold text-slate-900" @click="save">完成</button>
    </div>

    <div class="flex min-h-0 flex-1 items-center justify-center p-2">
      <canvas
        ref="canvas"
        class="max-h-full max-w-full touch-none rounded-lg"
        style="object-fit: contain"
        @pointerdown.prevent="down"
        @pointermove.prevent="move"
        @pointerup="up"
        @pointercancel="up"
      ></canvas>
    </div>

    <div class="space-y-3 bg-slate-900 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="flex min-h-14 flex-col items-center justify-center rounded-xl text-base font-bold"
          :class="tool === t.id ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white'"
          @click="tool = t.id"
        >
          <span class="text-2xl">{{ t.icon }}</span>{{ t.label }}
        </button>
      </div>
      <div class="flex items-center justify-between gap-3">
        <div class="flex gap-3">
          <button
            v-for="c in COLORS"
            :key="c"
            class="h-10 w-10 rounded-full border-2"
            :class="color === c ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-500'"
            :style="{ background: c }"
            :aria-label="`顏色 ${c}`"
            @click="color = c"
          ></button>
        </div>
        <div class="flex gap-2">
          <button class="min-h-11 rounded-xl bg-slate-700 px-4 text-white disabled:opacity-40" :disabled="!strokes.length" @click="undo">↩️ 復原</button>
          <button class="min-h-11 rounded-xl bg-slate-700 px-4 text-white disabled:opacity-40" :disabled="!strokes.length" @click="clear">🗑️ 清除</button>
        </div>
      </div>
    </div>
  </div>
</template>
