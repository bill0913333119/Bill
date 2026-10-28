<script setup>
// A4「工程缺失改善通知單」版面（794×1123px = 210×297mm @96dpi），供 PDF 點陣化輸出。
// 左欄為缺失現況（含紅圈標記），右欄為改善後對照框，廠商回報後自動填入改善照片。
import { computed } from 'vue'
import { formatDateTime, locationOf } from '../lib/defect.js'
import { contractorOf, store, tradeLabelOf } from '../store.js'

const props = defineProps({ record: { type: Object, required: true } })
const r = computed(() => props.record)
const major = computed(() => r.value.severity === 'major')
const rows = computed(() => {
  const n = Math.max(r.value.photos.length, 1)
  return Array.from({ length: n }, (_, i) => ({ before: r.value.photos[i], after: r.value.afterPhotos?.[i] }))
})
const signature = computed(() => r.value.signature || store.settings.signature)
const inspector = computed(() => r.value.inspector || store.settings.inspector)
</script>

<template>
  <div class="sheet">
    <header class="head">
      <div>
        <div class="title">工程缺失改善通知單</div>
        <div class="sub">{{ r.projectName }}</div>
      </div>
      <div class="no">
        <div>單號：{{ r.reportNo }}</div>
        <div>開單：{{ formatDateTime(r.createdAt) }}</div>
        <div class="sev" :class="major ? 'major' : 'normal'">{{ major ? '● 重大缺失' : '● 一般缺失' }}</div>
      </div>
    </header>

    <table class="info">
      <tr>
        <th>位置</th><td>{{ locationOf(r) }}</td>
        <th>工種</th><td>{{ tradeLabelOf(r.tradeId) }}</td>
      </tr>
      <tr>
        <th>缺失項目</th><td>{{ r.item }}</td>
        <th>責任廠商</th><td>{{ contractorOf(r.contractorId)?.name }}</td>
      </tr>
      <tr>
        <th>限期改善</th><td class="due">{{ r.dueDate }}</td>
        <th>開單人員</th><td>{{ inspector || '—' }}</td>
      </tr>
      <tr>
        <th>詳細說明</th><td colspan="3" class="desc">{{ r.description || '（無）' }}</td>
      </tr>
    </table>

    <div class="cols">
      <div class="section">缺失現況照片</div>
      <div class="section after">改善後對照（廠商填寫）</div>
    </div>
    <div class="compare" :style="{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }">
      <template v-for="(row, i) in rows" :key="i">
        <div class="cell"><img v-if="row.before" :src="row.before" /><span v-else class="ph">無照片</span></div>
        <div class="cell frame">
          <img v-if="row.after" :src="row.after" />
          <span v-else class="ph">改善後照片 {{ i + 1 }}</span>
        </div>
      </template>
    </div>

    <div class="reply">
      <b>改善說明：</b>
      <span v-if="r.replyNote" class="reply-text">{{ r.replyNote }}</span>
      <span v-if="r.repliedAt" class="reply-date">（回報時間：{{ formatDateTime(r.repliedAt) }}）</span>
    </div>

    <table class="sign">
      <tr><th>開單工程師</th><th>工地主任</th><th>責任廠商簽認</th><th>複查確認</th></tr>
      <tr>
        <td>
          <img v-if="signature" :src="signature" class="sig" alt="簽名" />
          <div class="sig-name">{{ inspector }}</div>
        </td>
        <td></td><td></td><td></td>
      </tr>
    </table>

    <div v-if="r.status === 'closed'" class="stamp">已結案<br /><small>{{ r.closedAt ? formatDateTime(r.closedAt) : '' }}</small></div>
  </div>
</template>

<style scoped>
.sheet {
  position: relative;
  width: 794px;
  height: 1123px;
  padding: 36px 44px;
  box-sizing: border-box;
  background: #fff;
  color: #111;
  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 8px; }
.title { font-size: 26px; font-weight: 800; letter-spacing: 2px; }
.sub { font-size: 16px; margin-top: 4px; color: #333; }
.no { text-align: right; font-size: 13px; line-height: 1.6; }
.sev { font-weight: 800; font-size: 15px; }
.sev.major { color: #dc2626; }
.sev.normal { color: #16a34a; }
.info, .sign { width: 100%; border-collapse: collapse; }
.info th, .info td, .sign th, .sign td { border: 1px solid #555; padding: 6px 10px; text-align: left; vertical-align: top; }
.info th, .sign th { background: #f1f5f9; width: 90px; white-space: nowrap; font-weight: 700; }
.due { color: #b91c1c; font-weight: 800; }
.desc { white-space: pre-wrap; line-height: 1.6; max-height: 96px; overflow: hidden; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
.section { font-weight: 800; font-size: 15px; border-left: 5px solid #dc2626; padding-left: 8px; }
.section.after { border-left-color: #16a34a; }
.compare { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cell { min-height: 0; border: 1px solid #888; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafafa; }
.cell img { width: 100%; height: 100%; object-fit: contain; display: block; }
.frame { border: 2px dashed #16a34a; background: #fff; }
.ph { color: #9ca3af; font-size: 15px; }
.reply { border: 1px solid #555; padding: 6px 10px; min-height: 44px; line-height: 1.6; }
.reply-text { white-space: pre-wrap; }
.reply-date { color: #555; font-size: 12px; }
.sign th { width: 25%; text-align: center; }
.sign td { height: 78px; text-align: center; vertical-align: middle; }
.sig { max-width: 140px; max-height: 52px; display: block; margin: 0 auto; }
.sig-name { font-size: 12px; color: #444; margin-top: 2px; }
.stamp { position: absolute; right: 70px; bottom: 170px; transform: rotate(-12deg); border: 4px solid #dc2626; color: #dc2626; border-radius: 12px; padding: 6px 18px; font-size: 30px; font-weight: 900; text-align: center; line-height: 1.1; opacity: .85; background: rgba(255,255,255,.6); }
.stamp small { font-size: 12px; font-weight: 700; }
</style>
