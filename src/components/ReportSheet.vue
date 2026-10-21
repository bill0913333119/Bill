<script setup>
// A4 缺失改善通知單版面（794×1123px = 210×297mm @96dpi），供 PDF 點陣化輸出。
import { computed } from 'vue'
import { formatDateTime } from '../lib/defect.js'
import { contractorOf, tradeLabelOf } from '../store.js'

const props = defineProps({ record: { type: Object, required: true } })
const r = computed(() => props.record)
const major = computed(() => r.value.severity === 'major')
const photoH = computed(() => (r.value.photos.length === 1 ? 420 : r.value.photos.length === 2 ? 300 : 230))
</script>

<template>
  <div class="sheet">
    <header class="head">
      <div>
        <div class="title">工地缺失改善通知單</div>
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
        <th>位置</th><td>{{ [r.building, r.floor].filter(Boolean).join(' ') }}</td>
        <th>工種</th><td>{{ tradeLabelOf(r.tradeId) }}</td>
      </tr>
      <tr>
        <th>缺失項目</th><td>{{ r.item }}</td>
        <th>責任廠商</th><td>{{ contractorOf(r.contractorId)?.name }}</td>
      </tr>
      <tr>
        <th>限期改善</th><td class="due">{{ r.dueDate }}</td>
        <th>開單人員</th><td>{{ r.inspector || '—' }}</td>
      </tr>
      <tr>
        <th>缺失說明</th><td colspan="3" class="desc">{{ r.description || '（無）' }}</td>
      </tr>
    </table>

    <div class="section">缺失照片</div>
    <div class="photos" :class="`n${r.photos.length}`">
      <img v-for="(p, i) in r.photos" :key="i" :src="p" :style="{ height: photoH + 'px' }" />
    </div>

    <div class="section">改善回覆（由責任廠商填寫）</div>
    <div class="reply">
      <div class="reply-box">
        改善說明：
        <div v-if="r.replyNote" class="reply-text">{{ r.replyNote }}</div>
        <div v-if="r.repliedAt" class="reply-date">回報時間：{{ formatDateTime(r.repliedAt) }}</div>
      </div>
      <div class="reply-box">
        改善後照片：
        <div v-if="r.afterPhotos?.length" class="after">
          <img v-for="(p, i) in r.afterPhotos" :key="i" :src="p" />
        </div>
      </div>
    </div>
    <div v-if="r.status === 'closed'" class="stamp">已結案<br /><small>{{ r.closedAt ? formatDateTime(r.closedAt) : '' }}</small></div>

    <table class="sign">
      <tr><th>開單工程師</th><th>工地主任</th><th>廠商簽認</th><th>複查確認</th></tr>
      <tr><td></td><td></td><td></td><td></td></tr>
    </table>
  </div>
</template>

<style scoped>
.sheet {
  width: 794px;
  height: 1123px;
  padding: 40px 44px;
  box-sizing: border-box;
  background: #fff;
  color: #111;
  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  font-size: 14px;
  display: flex;
  flex-direction: column;
}
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 10px; }
.title { font-size: 26px; font-weight: 800; letter-spacing: 2px; }
.sub { font-size: 16px; margin-top: 4px; color: #333; }
.no { text-align: right; font-size: 13px; line-height: 1.6; }
.sev { font-weight: 800; font-size: 15px; }
.sev.major { color: #dc2626; }
.sev.normal { color: #16a34a; }
.info, .sign { width: 100%; border-collapse: collapse; margin-top: 14px; }
.info th, .info td, .sign th, .sign td { border: 1px solid #555; padding: 7px 10px; text-align: left; vertical-align: top; }
.info th, .sign th { background: #f1f5f9; width: 90px; white-space: nowrap; font-weight: 700; }
.due { color: #b91c1c; font-weight: 800; }
.desc { white-space: pre-wrap; min-height: 48px; line-height: 1.6; }
.section { margin-top: 16px; font-weight: 800; font-size: 15px; border-left: 5px solid #f59e0b; padding-left: 8px; }
.photos { display: grid; gap: 8px; margin-top: 8px; }
.photos.n1 { grid-template-columns: 1fr; }
.photos.n2 { grid-template-columns: 1fr 1fr; }
.photos.n3 { grid-template-columns: 1fr 1fr 1fr; }
.photos img { width: 100%; object-fit: cover; border: 1px solid #999; }
.reply { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; flex: 1; }
.reply-box { border: 1px solid #555; padding: 8px; color: #555; display: flex; flex-direction: column; gap: 6px; }
.reply-text { color: #111; white-space: pre-wrap; line-height: 1.6; }
.reply-date { color: #555; font-size: 12px; }
.after { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.after img { width: 100%; height: 110px; object-fit: cover; border: 1px solid #999; }
.sheet { position: relative; }
.stamp { position: absolute; right: 70px; bottom: 150px; transform: rotate(-12deg); border: 4px solid #dc2626; color: #dc2626; border-radius: 12px; padding: 6px 18px; font-size: 30px; font-weight: 900; text-align: center; line-height: 1.1; opacity: .85; }
.stamp small { font-size: 12px; font-weight: 700; }
.sign { margin-top: 14px; }
.sign th { width: 25%; text-align: center; }
.sign td { height: 64px; }
</style>
