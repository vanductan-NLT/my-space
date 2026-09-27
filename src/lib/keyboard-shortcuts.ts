export const isTypingTarget = (target: EventTarget | null) => {
  if (!target) return false
  const element = target as EventTarget & { isContentEditable?: boolean; tagName?: string }
  return element.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? '')
}
