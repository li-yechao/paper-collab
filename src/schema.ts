// Copyright 2021 LiYechao
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
      content: 'image_block_content',
      marks: '',
      group: 'block',
      draggable: true,
      isolating: true,
    },
    image_block_content: {
      content: 'text*',
      marks: '',
    },
    video_block: {
      attrs: {
        src: { default: null },
        naturalWidth: { default: null },
        naturalHeight: { default: null },
        thumbnail: { default: null },
        poster: { default: null },
        dashArchiveSrc: { default: null },
      },
      content: 'video_block_content',
      marks: '',
      group: 'block',
      draggable: true,
      isolating: true,
    },
    video_block_content: {
      content: 'text*',
      marks: '',
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
