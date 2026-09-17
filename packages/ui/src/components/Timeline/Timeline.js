/**
 * Timeline Component — graphe de bande passante sur 60 secondes
 */
export function Timeline({ canvas }) {

  /**
   * @param {object}   opts
   * @param {object[]} opts.history   - [{down, up, alert}] 60 entrées
   * @param {number}   opts.peakDown  - valeur max pour l'axe Y
   */
  function draw({ history, peakDown }) {
    if (!canvas) return

    const W = canvas.offsetWidth  || canvas.width
    const H = canvas.offsetHeight || canvas.height
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W
      canvas.height = H
    }

    const ctx    = canvas.getContext('2d')
    const len    = history.length
    const maxVal = Math.max(12, peakDown * 1.2, 1)
    const pad    = { l: 44, r: 8, t: 6, b: 4 }
    const cW     = W - pad.l - pad.r
    const cH     = H - pad.t - pad.b

    ctx.clearRect(0, 0, W, H)

    // Grille horizontale
    ;[0, 0.25, 0.5, 0.75, 1].forEach(p => {
      const y = pad.t + cH * (1 - p)
      ctx.beginPath()
      ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth   = 0.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font      = '9px IBM Plex Mono, monospace'
      ctx.textAlign = 'right'
      ctx.fillText((maxVal * p).toFixed(1), pad.l - 4, y + 3)
    })

    if (len < 2) return

    // Zones d'alerte (fond rouge)
    history.forEach((d, i) => {
      if (!d.alert) return
      const x  = pad.l + (i / (len - 1)) * cW
      const bw = Math.max(1, cW / len)
      ctx.fillStyle = 'rgba(239,68,68,0.07)'
      ctx.fillRect(x - bw / 2, pad.t, bw, cH)
    })

    // Fill download
    ctx.beginPath()
    history.forEach((d, i) => {
      const x = pad.l + (i / (len - 1)) * cW
      const y = pad.t + cH * (1 - Math.min(d.down, maxVal) / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.lineTo(pad.l + cW, pad.t + cH)
    ctx.lineTo(pad.l,      pad.t + cH)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH)
    grad.addColorStop(0, 'rgba(34,197,94,0.2)')
    grad.addColorStop(1, 'rgba(34,197,94,0.02)')
    ctx.fillStyle = grad
    ctx.fill()

    // Ligne download
    ctx.beginPath()
    history.forEach((d, i) => {
      const x = pad.l + (i / (len - 1)) * cW
      const y = pad.t + cH * (1 - Math.min(d.down, maxVal) / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth   = 1.5
    ctx.stroke()

    // Ligne upload
    ctx.beginPath()
    history.forEach((d, i) => {
      const x = pad.l + (i / (len - 1)) * cW
      const y = pad.t + cH * (1 - Math.min(d.up, maxVal) / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth   = 1
    ctx.stroke()

    // Marqueur position courante (droite)
    ctx.beginPath()
    ctx.moveTo(pad.l + cW, pad.t)
    ctx.lineTo(pad.l + cW, pad.t + cH)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth   = 1
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }

  return { draw }
}
