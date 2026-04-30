import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AiProviderCatalogItem } from '@garlic-claw/shared'
import {
  applyProviderDriverDefaults,
  createProviderFormState,
  getProviderDriverHint,
  syncProviderFormState,
} from '@/features/ai-settings/components/provider-editor-form'
import { coreProviderCatalogFixture } from './provider-test.fixtures'

const catalog: AiProviderCatalogItem[] = coreProviderCatalogFixture

describe('provider-editor-form', () => {
  it('根据驱动和 provider id 返回正确提示', () => {
    expect(getProviderDriverHint('openai', 'openai', catalog)).toContain(
      '内建 OpenAI 供应商',
    )
    expect(getProviderDriverHint('anthropic', 'custom-anthropic', catalog)).toContain(
      'Anthropic 协议连接供应商',
    )
  })

  it('refreshes catalog defaults when creating a provider with another catalog driver', () => {
    const form = reactive(createProviderFormState())

    syncProviderFormState(form, null, catalog)
    form.driver = 'anthropic'
    applyProviderDriverDefaults(form, catalog, null)

    expect(form.id).toBe('anthropic')
    expect(form.name).toBe('Anthropic')
    expect(form.baseUrl).toBe('https://api.anthropic.com/v1')
    expect(form.defaultModel).toBe('claude-3-5-sonnet-20241022')
    expect(form.modelsText).toBe('claude-3-5-sonnet-20241022')
  })

  it('给自定义 provider 保留协议语义而不是核心预设', () => {
    const form = reactive(createProviderFormState())

    syncProviderFormState(form, null, catalog)
    form.id = 'gemini-proxy'
    form.driver = 'gemini'
    applyProviderDriverDefaults(form, catalog, null)

    expect(form.id).toBe('gemini-proxy')
    expect(form.name).toBe('Gemini 协议')
    expect(form.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(form.defaultModel).toBe('')
    expect(form.modelsText).toBe('')
  })
})
