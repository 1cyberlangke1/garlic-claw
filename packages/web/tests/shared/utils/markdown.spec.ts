import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/shared/utils/markdown'

describe('renderMarkdown', () => {
  it('supports common rich markdown blocks and sanitizes dangerous html', () => {
    const html = renderMarkdown(`# 标题

| 列一 | 列二 |
| --- | --- |
| A | B |

- [x] 已完成
- [ ] 待处理

这是脚注引用。[^1]

<script>alert('xss')</script>

[^1]: 脚注内容`)

    expect(html).toContain('<table>')
    expect(html).toContain('task-list-item')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('footnotes')
    expect(html).toContain('gc-md-heading-anchor')
    expect(html).not.toContain('<script>')
  })
})
