/**
 * SplitPane Layout
 * Helper pour créer un layout 2 ou 3 colonnes.
 */
export function SplitPane(container, columns = '1fr 1fr') {
  container.style.display             = 'grid'
  container.style.gridTemplateColumns = columns
  container.style.height              = '100%'
  container.style.overflow            = 'hidden'
  return container
}
