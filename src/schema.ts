import { Schema } from 'prosemirror-model'

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'title block+',
    },
    text: {
      group: 'inline',
    },
    title: {
      content: 'text*',
      marks: '',
      defining: true,
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'text*',
      marks: '',
      group: 'block',
      defining: true,
    },
    blockquote: {
      content: 'block+',
      group: 'block',
    },
    todo_list: {
      content: 'todo_item+',
      group: 'block',
    },
    todo_item: {
      attrs: { checked: { default: false } },
      content: 'paragraph block*',
      defining: true,
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
    },
    list_item: {
      content: 'paragraph block*',
      defining: true,
    },
    code_block: {
      attrs: { editorId: { default: null }, language: { default: null } },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      isolating: true,
      atom: true,
    },
    image_block: {
      attrs: {
        src: { default: null },
        naturalWidth: { default: null },
        naturalHeight: { default: null },
        thumbnail: { default: null },
      },
      content: 'text*',
      marks: '',
      group: 'block',
      draggable: true,
      isolating: true,
    },
    video_block: {
      attrs: {
        src: { default: null },
        naturalWidth: { default: null },
        naturalHeight: { default: null },
        thumbnail: { default: null },
      },
      content: 'text*',
      marks: '',
      group: 'block',
      draggable: true,
      isolating: true,
    },
  },
  marks: {
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
    },
    bold: {},
    italic: {},
    code: {
      excludes: '_',
    },
    underline: {},
    strikethrough: {},
    highlight: {},
  },
})
