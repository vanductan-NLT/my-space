import type { JSONContent } from '@tiptap/react'

/*
 * Small Markdown bridge for the Write editor. It covers what the toolbar can
 * produce (headings, emphasis, links, lists, task lists, quotes, code, rules,
 * tables) — not the whole CommonMark spec.
 */

const inline = (nodes: JSONContent[] = []): string =>
  nodes
    .map(node => {
      if (node.type === 'hardBreak') return '  \n'
      let text = node.text ?? ''
      const marks = node.marks ?? []
      const has = (type: string) => marks.some(m => m.type === type)
      if (has('code')) return `\`${text}\``
      if (has('bold')) text = `**${text}**`
      if (has('italic')) text = `*${text}*`
      if (has('strike')) text = `~~${text}~~`
      const link = marks.find(m => m.type === 'link')
      if (link) text = `[${text}](${link.attrs?.href ?? ''})`
      return text
    })
    .join('')

const indent = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((line, i) => (i === 0 || !line ? line : prefix + line))
    .join('\n')

const block = (node: JSONContent): string => {
  const children = node.content ?? []
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(node.attrs?.level ?? 1)} ${inline(children)}`
    case 'paragraph':
      return inline(children)
    case 'blockquote':
      return children.map(block).join('\n\n').split('\n').map(l => `> ${l}`.trimEnd()).join('\n')
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${children.map(c => c.text ?? '').join('')}\n\`\`\``
    case 'image':
      return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`
    case 'horizontalRule':
      return '---'
    case 'bulletList':
      return children.map(item => `- ${indent(children2md(item), '  ')}`).join('\n')
    case 'orderedList': {
      const start = node.attrs?.start ?? 1
      return children.map((item, i) => `${start + i}. ${indent(children2md(item), '   ')}`).join('\n')
    }
    case 'taskList':
      return children.map(item => `- [${item.attrs?.checked ? 'x' : ' '}] ${indent(children2md(item), '  ')}`).join('\n')
    case 'table': {
      const rows = children.map(row => (row.content ?? []).map(cell => (cell.content ?? []).map(block).join(' ').replace(/\|/g, '\\|')))
      if (!rows.length) return ''
      const line = (cells: string[]) => `| ${cells.join(' | ')} |`
      return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n')
    }
    default:
      return children.length ? children.map(block).join('\n\n') : node.text ?? ''
  }
}

// List items hold blocks; nested lists sit on their own line under the item.
const children2md = (item: JSONContent) => (item.content ?? []).map(block).join('\n')

export function toMarkdown(doc: JSONContent): string {
  return (doc.content ?? []).map(block).join('\n\n').trim() + '\n'
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const inlineHtml = (text: string) =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
      /^(https?:|mailto:)/i.test(href) ? `<a href="${href}">${label}</a>` : label
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')

/** Converts Markdown to HTML the editor can parse. Output is escaped; only http(s)/mailto links survive. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const image = line.match(/^!\[([^\]]*)\]\(((?:https?:|data:image\/)[^)\s]+)\)\s*$/)
    if (image) {
      out.push(`<img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}">`)
      i++
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      out.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`)
      i++
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${markdownToHtml(quote.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[i])) {
        const m = lines[i++].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/)!
        items.push(`<li data-type="taskItem" data-checked="${m[1] !== ' '}"><p>${inlineHtml(m[2])}</p></li>`)
      }
      out.push(`<ul data-type="taskList">${items.join('')}</ul>`)
      continue
    }
    const listType = /^\s*[-*+]\s+/.test(line) ? 'ul' : /^\s*\d+[.)]\s+/.test(line) ? 'ol' : null
    if (listType) {
      const marker = listType === 'ul' ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/
      const items: string[] = []
      while (i < lines.length && marker.test(lines[i])) items.push(`<li><p>${inlineHtml(lines[i++].replace(marker, ''))}</p></li>`)
      out.push(`<${listType}>${items.join('')}</${listType}>`)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) paragraph.push(lines[i++])
    if (!paragraph.length) paragraph.push(lines[i++])
    out.push(`<p>${paragraph.map(inlineHtml).join('<br>')}</p>`)
  }
  return out.join('')
}
