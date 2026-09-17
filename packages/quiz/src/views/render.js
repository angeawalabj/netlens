/**
 * Quiz Render
 *
 * Translates quiz state into DOM mutations.
 * Called after every state change.
 *
 * Rule: reads state, updates DOM. Never dispatches actions.
 */

import { QUESTIONS }    from '@netlens/core/quiz/questions.js'
import { Selectors, Screens } from '../state.js'
import { toggleClass, formatDuration } from '@netlens/ui/components/dom.js'

// ─── Constants ────────────────────────────────────────

const LETTERS = 'ABCDE'

const TYPE_META = {
  1: { label: 'Recall',        color: '#3b82f6', bg: 'rgba(59,130,246,.12)'  },
  2: { label: 'Analysis',      color: '#22c55e', bg: 'rgba(34,197,94,.12)'   },
  3: { label: 'Troubleshoot',  color: '#f59e0b', bg: 'rgba(245,158,11,.12)'  },
  4: { label: 'Packets',       color: '#8b5cf6', bg: 'rgba(139,92,246,.12)'  },
  5: { label: 'Decisions',     color: '#ef4444', bg: 'rgba(239,68,68,.12)'   },
}

// ─── Screen routing ───────────────────────────────────

/**
 * @param {import('../state.js').QuizAppState} state
 */
export function render(state) {
  updateProgressBar(state)
  updateTopbar(state)

  switch (state.screen) {
    case Screens.START:    renderStart(state);   break
    case Screens.QUESTION: renderQuestion(state); break
    case Screens.RESULTS:  renderResults(state);  break
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => {
    el.hidden = el.id !== id
  })
}

// ─── Topbar ───────────────────────────────────────────

function updateTopbar(state) {
  const timer = document.getElementById('timerChip')
  const score = document.getElementById('scoreChip')

  if (timer) {
    if (state.timeLeft !== null && state.screen === Screens.QUESTION) {
      timer.textContent = state.timeLeft + 's'
      timer.className   = 'timer-chip ' + Selectors.timerClass(state)
      timer.hidden      = false
    } else {
      timer.hidden = true
    }
  }

  if (score) {
    score.textContent = Selectors.score(state) + ' pts'
    score.hidden      = state.screen === Screens.START
  }
}

function updateProgressBar(state) {
  const fill = document.getElementById('progressFill')
  if (!fill) return
  fill.style.width = Math.max(0, Selectors.progress(state) * 100) + '%'
}

// ─── START screen ─────────────────────────────────────

function renderStart(state) {
  showScreen('screenStart')

  // Update weak count badge
  const weakMeta = document.getElementById('weakCount')
  if (weakMeta) {
    const n = Selectors.weakCount(state)
    weakMeta.textContent = n > 0 ? `${n} questions` : '— no history yet'
  }

  // Active mode card
  document.querySelectorAll('.mode-card').forEach(card => {
    const isActive = card.dataset.mode === state.mode
    toggleClass(card, 'mode-card--active', isActive)
  })

  // Active type filter chip
  document.querySelectorAll('[data-type-filter]').forEach(chip => {
    toggleClass(chip, 'chip--active', chip.dataset.typeFilter === state.typeFilter)
  })

  // Active week filter chip
  document.querySelectorAll('[data-week-filter]').forEach(chip => {
    toggleClass(chip, 'chip--active', chip.dataset.weekFilter === state.weekFilter)
  })
}

// ─── QUESTION screen ──────────────────────────────────

function renderQuestion(state) {
  showScreen('screenQuestion')

  const q = Selectors.currentQuestion(state)
  if (!q) return

  const session  = state.session
  const typeMeta = TYPE_META[q.type] ?? TYPE_META[1]
  const answered = state.answered
  const result   = Selectors.lastResult(state)

  // ── Nav panel dots ──────────────────────────────────
  const nav = document.getElementById('questionNav')
  if (nav) {
    nav.innerHTML = session.queue.map((qq, i) => {
      const r   = session.results.find(r => r.questionId === qq.id)
      const cls = i === session.index ? 'nav-dot nav-dot--current'
        : !r              ? 'nav-dot'
        : r.skipped       ? 'nav-dot nav-dot--skipped'
        : r.correct       ? 'nav-dot nav-dot--correct'
        :                   'nav-dot nav-dot--wrong'
      return `<button class="${cls}" data-action="jump" data-payload="${i}"
                      aria-label="Question ${i + 1}">${i + 1}</button>`
    }).join('')

    // Stats
    const correct = session.results.filter(r => r.correct).length
    const wrong   = session.results.filter(r => !r.correct && !r.skipped).length
    const skipped = session.results.filter(r => r.skipped).length

    const statsEl = document.getElementById('navStats')
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="nav-stat"><span class="nav-stat__label">Answered</span>
          <span class="nav-stat__val">${session.results.filter(r => !r.skipped).length} / ${session.queue.length}</span></div>
        <div class="nav-stat"><span class="nav-stat__label">Correct</span>
          <span class="nav-stat__val nav-stat__val--success">${correct}</span></div>
        <div class="nav-stat"><span class="nav-stat__label">Wrong</span>
          <span class="nav-stat__val nav-stat__val--danger">${wrong}</span></div>
        <div class="nav-stat"><span class="nav-stat__label">Skipped</span>
          <span class="nav-stat__val">${skipped}</span></div>`
    }
  }

  // ── Breadcrumb ──────────────────────────────────────
  const bread = document.getElementById('qBreadcrumb')
  if (bread) {
    bread.innerHTML = `
      <span class="breadcrumb__num">${session.index + 1} / ${session.queue.length}</span>
      <span class="breadcrumb__sep">/</span>
      <span class="breadcrumb__type"
            style="background:${typeMeta.bg};color:${typeMeta.color}">
        T${q.type} · ${typeMeta.label}
      </span>
      <span class="breadcrumb__sep">/</span>
      <span class="breadcrumb__week">Week ${q.week}</span>`
  }

  // ── Question text ───────────────────────────────────
  const qText = document.getElementById('qText')
  if (qText) qText.textContent = q.q

  const qCtx = document.getElementById('qContext')
  if (qCtx) {
    qCtx.textContent = q.x ?? ''
    qCtx.hidden      = !q.x
  }

  const multiNote = document.getElementById('qMultiNote')
  if (multiNote) multiNote.hidden = !q.multi

  // ── Choices ─────────────────────────────────────────
  const choicesEl = document.getElementById('choices')
  if (choicesEl) {
    choicesEl.innerHTML = q.ch.map((text, i) => {
      let cls = 'choice'
      if (answered) {
        const isCorrect = q.ok.includes(i)
        const isSelected = state.selected.includes(i)
        if (isCorrect && isSelected)  cls += ' choice--correct'
        else if (!isCorrect && isSelected) cls += ' choice--wrong'
        else if (isCorrect && !isSelected) cls += ' choice--missed'
        cls += ' choice--locked'
      } else if (state.selected.includes(i)) {
        cls += ' choice--selected'
      }
      return `
        <button class="${cls}"
                data-action="toggle-choice"
                data-payload="${i}"
                ${answered ? 'disabled' : ''}>
          <span class="choice__key">${LETTERS[i]}</span>
          <span class="choice__text">${text}</span>
        </button>`
    }).join('')
  }

  // ── Explanation ─────────────────────────────────────
  const explEl = document.getElementById('explanation')
  if (explEl) {
    if (answered && result) {
      const isOk = result.correct
      explEl.hidden    = false
      explEl.className = 'explanation ' + (isOk ? 'explanation--correct' : 'explanation--wrong')
      explEl.innerHTML = `
        <div class="explanation__verdict ${isOk ? 'explanation__verdict--ok' : 'explanation__verdict--fail'}">
          ${isOk ? '✓  Correct' : '✗  Incorrect'}
          <span class="explanation__time">· ${result.timeSeconds}s</span>
        </div>
        <div class="explanation__text">${q.e}</div>
        ${q.c ? `<div class="explanation__concept">◎ ${q.c}</div>` : ''}`
    } else {
      explEl.hidden = true
    }
  }

  // ── Action buttons ───────────────────────────────────
  const btnValidate = document.getElementById('btnValidate')
  const btnNext     = document.getElementById('btnNext')
  const btnSkip     = document.getElementById('btnSkip')

  if (btnValidate) {
    btnValidate.disabled = !Selectors.canValidate(state)
    btnValidate.hidden   = answered
  }
  if (btnNext) {
    btnNext.hidden = !answered
  }
  if (btnSkip) {
    btnSkip.hidden = answered
  }
}

// ─── RESULTS screen ───────────────────────────────────

function renderResults(state) {
  showScreen('screenResults')
  if (!state.stats) return

  const { stats, verdict } = state

  // Ring
  const CIRCUMFERENCE = 2 * Math.PI * 50 // r=50, 314px
  const offset  = CIRCUMFERENCE * (1 - stats.correct / Math.max(1, stats.total))
  const ringArc = document.getElementById('ringArc')
  if (ringArc) {
    setTimeout(() => {
      ringArc.style.strokeDashoffset = offset
      ringArc.style.stroke = stats.score >= 70 ? '#22c55e'
        : stats.score >= 50 ? '#f59e0b' : '#ef4444'
    }, 150)
  }

  const ringVal = document.getElementById('ringScore')
  const ringTot = document.getElementById('ringTotal')
  if (ringVal) ringVal.textContent = stats.correct
  if (ringTot) ringTot.textContent = `/ ${stats.total}`

  // Verdict
  const verdictEl = document.getElementById('verdict')
  const descEl    = document.getElementById('verdictDesc')
  if (verdictEl) verdictEl.textContent = verdict.title
  if (descEl)    descEl.textContent    = verdict.description

  // Stats row
  const statsEl = document.getElementById('resultStats')
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="result-stat">
        <div class="result-stat__val">${stats.score}%</div>
        <div class="result-stat__label">Score</div>
      </div>
      <div class="result-stat">
        <div class="result-stat__val">${formatDuration(stats.durationSec)}</div>
        <div class="result-stat__label">Duration</div>
      </div>
      <div class="result-stat">
        <div class="result-stat__val">${stats.avgTimeSec}s</div>
        <div class="result-stat__label">Avg / question</div>
      </div>
      <div class="result-stat">
        <div class="result-stat__val">${stats.skipped}</div>
        <div class="result-stat__label">Skipped</div>
      </div>`
  }

  // Score by type
  const byTypeEl = document.getElementById('byType')
  if (byTypeEl) {
    byTypeEl.innerHTML = Object.entries(stats.byType).map(([t, data]) => {
      const meta = TYPE_META[parseInt(t)] ?? TYPE_META[1]
      const pct  = Math.round((data.correct / data.total) * 100)
      return `
        <div class="breakdown-row">
          <span class="breakdown-row__name">Type ${t} — ${meta.label}</span>
          <div class="breakdown-row__bar-wrap">
            <div class="breakdown-row__bar"
                 style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <span class="breakdown-row__score">${data.correct}/${data.total}</span>
        </div>`
    }).join('')
  }

  // Review list
  const reviewEl = document.getElementById('reviewList')
  if (reviewEl && state.session) {
    const sorted = [...state.session.results].sort((a, b) => {
      if (a.correct !== b.correct) return a.correct ? 1 : -1
      return b.skipped - a.skipped
    })
    reviewEl.innerHTML = sorted.slice(0, 20).map(r => {
      const q   = QUESTIONS.find(q => q.id === r.questionId)
      if (!q) return ''
      const cls = r.skipped ? 'review-item--skip'
        : r.correct         ? 'review-item--ok'
        :                     'review-item--fail'
      const icon = r.skipped ? '—' : r.correct ? '✓' : '✗'
      const text = q.q.length > 90 ? q.q.slice(0, 90) + '…' : q.q
      return `
        <div class="review-item ${cls}">
          <span class="review-item__icon">${icon}</span>
          <span class="review-item__text">${text}</span>
          <span class="review-item__time">${r.skipped ? 'skipped' : r.timeSeconds + 's'}</span>
        </div>`
    }).join('')
  }
}
