/**
 * QuizCard Component — rendu d'une question avec ses choix
 */
import { createElement } from '../dom.js'

const LETTERS = 'ABCDE'

/**
 * @param {object}   opts
 * @param {HTMLElement} opts.container
 * @param {function=}   opts.onToggle  - appelé avec index du choix cliqué
 */
export function QuizCard({ container, onToggle }) {

  /**
   * @param {object}   opts
   * @param {object}   opts.question   - objet question (ch, ok, multi)
   * @param {number[]} opts.selected   - indices sélectionnés
   * @param {boolean}  opts.answered   - réponse validée
   */
  function render({ question, selected, answered }) {
    container.innerHTML = ''

    const wrap = createElement('div', { className: 'choices' })

    question.ch.forEach((text, i) => {
      let cls = 'choice'

      if (answered) {
        const isCorrect  = question.ok.includes(i)
        const isSelected = selected.includes(i)

        if (isCorrect && isSelected)       cls += ' choice--correct'
        else if (!isCorrect && isSelected) cls += ' choice--wrong'
        else if (isCorrect && !isSelected) cls += ' choice--missed'
        cls += ' choice--locked'
      } else if (selected.includes(i)) {
        cls += ' choice--selected'
      }

      const btn  = createElement('button', { className: cls })
      btn.appendChild(createElement('span', {
        className:   'choice__key',
        textContent: LETTERS[i],
      }))
      btn.appendChild(createElement('span', {
        className:   'choice__text',
        textContent: text,
      }))

      if (!answered) {
        btn.addEventListener('click', () => onToggle?.(i))
      } else {
        btn.disabled = true
      }

      wrap.appendChild(btn)
    })

    container.appendChild(wrap)
  }

  return { render }
}
