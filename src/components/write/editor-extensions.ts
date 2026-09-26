import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import FontFamily from '@tiptap/extension-font-family'
import { getLang, translate } from '@/lib/i18n'
import { FontSize } from './font-size'
import { ImageNode } from './image-node'

/** The shared schema used for editing, rich clipboard paste and HTML import. */
export const writeExtensions = [
  StarterKit,
  Underline,
  Link.configure({ openOnClick: false }),
  Placeholder.configure({
    showOnlyCurrent: true,
    placeholder: ({ editor, node }) =>
      node.type.name === 'heading'
        ? translate('Heading {n}', { n: node.attrs.level }, getLang())
        : editor.isEmpty
          ? translate("Start writing, or type '/' for blocks", undefined, getLang())
          : translate("Type '/' for blocks", undefined, getLang()),
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  ImageNode,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  FontSize,
  FontFamily,
  Subscript,
  Superscript,
]
