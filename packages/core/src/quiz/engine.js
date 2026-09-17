/**
 * Quiz Engine
 *
 * Pure logic. No DOM. No side effects.
 * Receives a configuration, returns state transitions.
 *
 * Single Responsibility: manage quiz session state.
 * Questions data lives in questions.js — separate file,
 * separate reason to change.
 */

// ─── Types ────────────────────────────────────────────

/**
 * @typedef {'normal'|'exam'|'weak'|'sprint'} QuizMode
 *
 * normal  — all questions, no time limit
 * exam    — timed (45s per question)
 * weak    — only previously wrong answers
 * sprint  — 20 random questions
 */

/**
 * @typedef {Object} QuizConfig
 * @property {QuizMode} mode
 * @property {string}   typeFilter  - '1'|'2'|'3'|'4'|'5'|'all'
 * @property {string}   weekFilter  - '1'|'2'|'3'|'4'|'all'
 * @property {Object}   history     - {[questionId]: boolean} past results
 */

/**
 * @typedef {Object} QuizSession
 * @property {Question[]} queue      - Ordered question list for this session
 * @property {number}     index      - Current question index
 * @property {Result[]}   results    - Completed question results
 * @property {number}     startedAt  - Timestamp ms
 * @property {number|null} timeLimit - Seconds per question, or null
 */

/**
 * @typedef {Object} Result
 * @property {number}   questionId
 * @property {number[]} selected    - Chosen answer indices
 * @property {boolean}  correct
 * @property {boolean}  skipped
 * @property {number}   timeSeconds
 */

/**
 * @typedef {Object} SessionStats
 * @property {number} total
 * @property {number} correct
 * @property {number} wrong
 * @property {number} skipped
 * @property {number} score        - 0–100
 * @property {number} durationSec
 * @property {number} avgTimeSec
 * @property {Object} byType       - {[type]: {correct, total}}
 */

// ─── Constants ────────────────────────────────────────

const SPRINT_SIZE = 20
const EXAM_SECONDS_PER_QUESTION = 45

// ─── Session Builder ──────────────────────────────────

/**
 * Build a quiz session from a configuration.
 *
 * @param {QuizConfig} config
 * @param {Question[]} allQuestions
 * @returns {QuizSession}
 */
export function buildSession(config, allQuestions) {
  const queue = buildQueue(config, allQuestions)

  return {
    queue,
    index:     0,
    results:   [],
    startedAt: Date.now(),
    timeLimit: config.mode === 'exam' ? EXAM_SECONDS_PER_QUESTION : null,
  }
}

/**
 * Build the ordered question queue for a session.
 * @param {QuizConfig}  config
 * @param {Question[]}  allQuestions
 * @returns {Question[]}
 */
function buildQueue(config, allQuestions) {
  let pool = [...allQuestions]

  // Apply type filter
  if (config.typeFilter !== 'all') {
    pool = pool.filter(q => String(q.type) === config.typeFilter)
  }

  // Apply week filter
  if (config.weekFilter !== 'all') {
    pool = pool.filter(q => String(q.week) === config.weekFilter)
  }

  // Weak mode: keep only previously wrong questions
  if (config.mode === 'weak') {
    const wrongIds = new Set(
      Object.entries(config.history || {})
        .filter(([, correct]) => !correct)
        .map(([id]) => Number(id))
    )
    const weak = pool.filter(q => wrongIds.has(q.id))
    // Fallback to full pool if no weak questions found
    pool = weak.length > 0 ? weak : pool
  }

  // Shuffle deterministically (Fisher-Yates)
  pool = shuffle(pool)

  // Sprint mode: limit to SPRINT_SIZE
  if (config.mode === 'sprint') {
    pool = pool.slice(0, SPRINT_SIZE)
  }

  return pool
}

// ─── State Transitions ────────────────────────────────

/**
 * Submit an answer for the current question.
 * Returns the updated session — does not mutate the input.
 *
 * @param {QuizSession} session
 * @param {number[]}    selectedIndices
 * @param {number}      timeTakenSec
 * @returns {QuizSession}
 */
export function submitAnswer(session, selectedIndices, timeTakenSec) {
  const question = currentQuestion(session)
  if (!question) return session

  const correct = isCorrect(question, selectedIndices)

  const result = {
    questionId:  question.id,
    selected:    selectedIndices,
    correct,
    skipped:     false,
    timeSeconds: timeTakenSec,
  }

  return {
    ...session,
    results: [...session.results, result],
  }
}

/**
 * Skip the current question.
 * @param {QuizSession} session
 * @returns {QuizSession}
 */
export function skipQuestion(session) {
  const question = currentQuestion(session)
  if (!question) return session

  const result = {
    questionId:  question.id,
    selected:    [],
    correct:     false,
    skipped:     true,
    timeSeconds: 0,
  }

  return {
    ...session,
    results: [...session.results, result],
  }
}

/**
 * Advance to the next question.
 * @param {QuizSession} session
 * @returns {QuizSession}
 */
export function advance(session) {
  return {
    ...session,
    index: session.index + 1,
  }
}

/**
 * Jump to a specific question index.
 * @param {QuizSession} session
 * @param {number}      index
 * @returns {QuizSession}
 */
export function jumpTo(session, index) {
  if (index < 0 || index >= session.queue.length) return session
  return { ...session, index }
}

// ─── Queries ──────────────────────────────────────────

/**
 * Get the current question or null if session is complete.
 * @param {QuizSession} session
 * @returns {Question|null}
 */
export function currentQuestion(session) {
  return session.queue[session.index] ?? null
}

/**
 * Check if the session is complete (all questions answered).
 * @param {QuizSession} session
 * @returns {boolean}
 */
export function isComplete(session) {
  return session.results.length >= session.queue.length
}

/**
 * Check if the current question has been answered.
 * @param {QuizSession} session
 * @returns {boolean}
 */
export function isAnswered(session) {
  return session.results.some(
    r => r.questionId === currentQuestion(session)?.id
  )
}

/**
 * Get result for a specific question id.
 * @param {QuizSession} session
 * @param {number}      questionId
 * @returns {Result|null}
 */
export function getResult(session, questionId) {
  return session.results.find(r => r.questionId === questionId) ?? null
}

/**
 * Compute full statistics for a completed session.
 * @param {QuizSession} session
 * @param {Question[]}  allQuestions
 * @returns {SessionStats}
 */
export function computeStats(session, allQuestions) {
  const results  = session.results
  const total    = results.length
  const correct  = results.filter(r => r.correct).length
  const skipped  = results.filter(r => r.skipped).length
  const wrong    = total - correct - skipped
  const answered = results.filter(r => !r.skipped)
  const avgTime  = answered.length
    ? Math.round(answered.reduce((s, r) => s + r.timeSeconds, 0) / answered.length)
    : 0

  // Score by question type
  const byType = {}
  for (const result of results) {
    const q = allQuestions.find(q => q.id === result.questionId)
    if (!q) continue
    if (!byType[q.type]) byType[q.type] = { correct: 0, total: 0 }
    byType[q.type].total++
    if (result.correct) byType[q.type].correct++
  }

  return {
    total,
    correct,
    wrong,
    skipped,
    score:       total > 0 ? Math.round((correct / total) * 100) : 0,
    durationSec: Math.round((Date.now() - session.startedAt) / 1000),
    avgTimeSec:  avgTime,
    byType,
  }
}

/**
 * Build a history update object from session results.
 * Merges with existing history (preserving prior sessions).
 *
 * @param {Object}   existingHistory  - {[questionId]: boolean}
 * @param {Result[]} results
 * @returns {Object}
 */
export function updateHistory(existingHistory, results) {
  const updated = { ...existingHistory }
  for (const result of results) {
    if (!result.skipped) {
      updated[result.questionId] = result.correct
    }
  }
  return updated
}

/**
 * Compute verdict text from score.
 * @param {number} score - 0 to 100
 * @returns {{ title: string, description: string }}
 */
export function getVerdict(score) {
  if (score >= 83) return {
    title: 'Expert',
    description: 'Strong across all protocol layers. Consider CCNA or CompTIA Network+.',
  }
  if (score >= 70) return {
    title: 'Advanced',
    description: 'Solid understanding. Ready for real-world troubleshooting.',
  }
  if (score >= 55) return {
    title: 'Intermediate',
    description: 'Good foundations. Focus on Types 3, 4, and 5 to go further.',
  }
  if (score >= 40) return {
    title: 'Building up',
    description: 'Core concepts are there. Review Weeks 1 and 2 before continuing.',
  }
  return {
    title: 'Needs work',
    description: 'Start with the Protocol Sandbox before retaking the assessment.',
  }
}

// ─── Helpers ──────────────────────────────────────────

/**
 * Check if selected indices match the correct answers.
 * @param {Question} question
 * @param {number[]} selected
 * @returns {boolean}
 */
function isCorrect(question, selected) {
  const a = [...selected].sort((a, b) => a - b)
  const b = [...question.correct].sort((a, b) => a - b)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * Fisher-Yates shuffle — returns a new array, does not mutate.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffle(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
