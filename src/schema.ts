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
      defining: true,
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'text*',
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
      attrs: { language: { default: null } },
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      isolating: true,
      atom: true,
    },
    image_block: {
      attrs: { src: { default: null }, caption: { default: null } },
      group: 'block',
      defining: true,
      isolating: true,
      atom: true,
      draggable: true,
    },
    video_block: {
      attrs: { src: { default: null }, caption: { default: null } },
      group: 'block',
      defining: true,
      isolating: true,
      atom: true,
      draggable: true,
    },
  },
  marks: {
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
    },
    bold: {},
    italic: {},
    code: {},
    underline: {},
    strikethrough: {},
  },
})