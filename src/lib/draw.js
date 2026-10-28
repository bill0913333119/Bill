// 標註繪圖：畫筆、圓圈（橢圓）、箭頭。座標一律為圖片原始像素。

export function arrowHead(from, to, size) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const spread = Math.PI / 7
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ]
}

export function drawStroke(ctx, s, lineWidth) {
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (s.tool === 'pen') {
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y)
  } else if (s.tool === 'circle') {
    const [a, b] = s.points
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2)
  } else if (s.tool === 'arrow') {
    const [a, b] = s.points
    const [h1, h2] = arrowHead(a, b, lineWidth * 5)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.moveTo(h1.x, h1.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(h2.x, h2.y)
  }
  ctx.stroke()
  ctx.restore()
}
