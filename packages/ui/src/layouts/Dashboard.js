/**
 * Dashboard Layout
 * Topbar + metrics row + workspace grid + timeline.
 */
export function applyDashboardLayout(workspaceEl, opts = {}) {
  const { cols = '220px 1fr 260px', rows = '1fr 120px' } = opts
  workspaceEl.style.display             = 'grid'
  workspaceEl.style.gridTemplateColumns = cols
  workspaceEl.style.gridTemplateRows    = rows
  workspaceEl.style.flex                = '1'
  workspaceEl.style.overflow            = 'hidden'
  workspaceEl.style.gap                 = '1px'
  workspaceEl.style.background          = 'var(--border)'
}
