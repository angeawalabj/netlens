/**
 * DOM Utilities
 *
 * Thin helpers over native DOM APIs.
 * No framework, no virtual DOM.
 * Every function is pure or has a single clear side effect.
 */

/**
 * Create a DOM element with properties applied in one call.
 *
 * @param {string} tag
 * @param {Object} props
 * @param {string} [props.className]
 * @param {string} [props.textContent]
 * @param {string} [props.innerHTML]
 * @param {string} [props.style]
 * @param {Object} [props.dataset]
 * @param {...*}   [props.*]  - Any other property set directly on the element
 * @returns {HTMLElement}
 */
export function createElement(tag, props = {}) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') {
      Object.assign(el.dataset, value)
    } else if (key === 'className') {
      el.className = value
    } else {
      el[key] = value
    }
  }
  return el
}

/**
 * Query a required element. Throws if not found.
 * Catches typos in selectors early rather than silent null bugs.
 *
 * @param {string}   selector
 * @param {Element}  [root=document]
 * @returns {HTMLElement}
 */
export function requireElement(selector, root = document) {
  const el = root.querySelector(selector)
  if (!el) throw new Error(`Required element not found: "${selector}"`)
  return el
}

/**
 * Safe querySelector — returns null, never throws.
 * @param {string}  selector
 * @param {Element} [root=document]
 * @returns {HTMLElement|null}
 */
export function findElement(selector, root = document) {
  return root.querySelector(selector)
}

/**
 * Set multiple CSS custom properties on an element.
 * @param {HTMLElement} el
 * @param {Object}      vars  — { '--my-var': 'value' }
 */
export function setCSSVars(el, vars) {
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value)
  }
}

/**
 * Toggle a CSS class based on a boolean condition.
 * @param {HTMLElement} el
 * @param {string}      className
 * @param {boolean}     condition
 */
export function toggleClass(el, className, condition) {
  el.classList.toggle(className, condition)
}

/**
 * Remove all children from an element.
 * Faster than setting innerHTML = '' for large trees.
 * @param {HTMLElement} el
 */
export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/**
 * Append multiple children to an element.
 * @param {HTMLElement}   el
 * @param {HTMLElement[]} children
 */
export function appendChildren(el, children) {
  const frag = document.createDocumentFragment()
  children.forEach(child => frag.appendChild(child))
  el.appendChild(frag)
}

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB'
  return bytes + ' B'
}

/**
 * Format seconds to MM:SS or HH:MM:SS string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }
  return `${seconds}s`
}

/**
 * Format a timestamp (ms) to HH:MM:SS.
 * @param {number} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  const d = new Date(ts)
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
    d.getSeconds().toString().padStart(2, '0'),
  ].join(':')
}

/**
 * Escape HTML special characters.
 * Use when inserting user content into innerHTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
