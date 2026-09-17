/**
 * Persistence Controller
 *
 * Handles all localStorage reads and writes.
 * Single Responsibility: persist and rehydrate quiz history.
 *
 * Isolated from state logic and rendering — if localStorage
 * is unavailable (private browsing), the app still works.
 */

const STORAGE_KEY = 'netlens:quiz:history:v1'

/**
 * Load quiz history from localStorage.
 * Returns empty object if nothing stored or parse fails.
 *
 * @returns {Object} — { [questionId: string]: boolean }
 */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * Persist quiz history to localStorage.
 * Silently ignores write failures (quota exceeded, private browsing).
 *
 * @param {Object} history — { [questionId: string]: boolean }
 */
export function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Silent fail — app works without persistence
  }
}

/**
 * Clear all persisted history.
 */
export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silent fail
  }
}

/**
 * Count how many questions have been answered incorrectly.
 * @param {Object} history
 * @returns {number}
 */
export function countWeak(history) {
  return Object.values(history).filter(v => !v).length
}
