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
      content: 'title tag_list block+',
    },
    text: {
      group: 'inline',
    },
    title: {
      content: 'text*',
      marks: '',
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
    },
    ordered_list: {
      content: 'ordered_item+',
      group: 'block',
    },
    ordered_item: {
      content: 'paragraph block*',
    },
    bullet_list: {
      content: 'bullet_item+',
      group: 'block',
    },
    bullet_item: {
      content: 'paragraph block*',
    },
    code_block: {
      attrs: { editorId: { default: null }, language: { default: null } },
      content: 'text*',
      marks: '',
      group: 'block',
    },
    image_block: {
      attrs: {
        src: { default: null },
        naturalWidth: { default: null },
        naturalHeight: { default: null },
        thumbnail: { default: null },
      },
      content: 'image_block_caption',
      marks: '',
      group: 'block',
    },
    image_block_caption: {
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
      content: 'video_block_caption',
      marks: '',
      group: 'block',
    },
    video_block_caption: {
      content: 'text*',
      marks: '',
    },
    tag_list: {
      content: `tag_item+`,
      marks: '',
    },
    tag_item: {
      content: 'text*',
      marks: '',
    },
  },
  marks: {
    link: {
      attrs: { href: { default: '' } },
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
