import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer.mjs'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItTaskLists from 'markdown-it-task-lists'

const MARKDOWN_CACHE_LIMIT = 400
const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const markdownCache = new Map<string, string>()

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language): string {
    const normalizedLanguage = language.trim().toLowerCase()

    try {
      const highlighted = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
        ? hljs.highlight(code, {
          ignoreIllegals: true,
          language: normalizedLanguage,
        }).value
        : hljs.highlightAuto(code).value

      const languageClass = normalizedLanguage
        ? ` language-${normalizedLanguage}`
        : ''

      return `<pre class="gc-md-code-block hljs"><code class="hljs${languageClass}">${highlighted}</code></pre>`
    } catch {
      const escapedCode = escapeHtml(code)
      return `<pre class="gc-md-code-block"><code>${escapedCode}</code></pre>`
    }
  },
})

markdown.use(markdownItAnchor, {
  level: [1, 2, 3, 4, 5, 6],
  permalink: markdownItAnchor.permalink.linkAfterHeader({
    assistiveText: (title) => `跳转到标题：${title}`,
    class: 'gc-md-heading-anchor',
    symbol: '#',
    visuallyHiddenClass: 'gc-md-visually-hidden',
  }),
})
markdown.use(markdownItFootnote)
markdown.use(markdownItTaskLists, {
  enabled: true,
  label: true,
  labelAfter: true,
})

const defaultLinkRenderer: RenderRule | undefined = markdown.renderer.rules.link_open

markdown.renderer.rules.link_open = (tokens, index, options, env, self): string => {
  const token = tokens[index]

  if (token.attrIndex('target') < 0) {
    token.attrPush(['target', '_blank'])
  }

  if (token.attrIndex('rel') < 0) {
    token.attrPush(['rel', 'noopener noreferrer nofollow'])
  }

  if (typeof defaultLinkRenderer === 'function') {
    return defaultLinkRenderer(tokens, index, options, env, self)
  }

  return self.renderToken(tokens, index, options)
}

export function renderMarkdown(source: string): string {
  if (!source) {
    return ''
  }

  const cachedHtml = markdownCache.get(source)
  if (cachedHtml) {
    return cachedHtml
  }

  const renderedHtml = markdown.render(source)
  const sanitizedHtml = DOMPurify.sanitize(renderedHtml, {
    ADD_ATTR: ['target', 'rel'],
  })

  if (markdownCache.size >= MARKDOWN_CACHE_LIMIT) {
    markdownCache.clear()
  }

  markdownCache.set(source, sanitizedHtml)
  return sanitizedHtml
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character] ?? character)
}
