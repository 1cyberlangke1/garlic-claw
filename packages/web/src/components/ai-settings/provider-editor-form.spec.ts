import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AiProviderCatalogItem } from '@garlic-claw/shared'
import {
  applyProviderDriverDefaults,
  createProviderFormState,
  getCatalogDriverOptions,
  getProviderDriverHint,
  syncProviderFormState,
} from './provider-editor-form'
import {
  coreProviderCatalogFixture,
  createCatalogPresetFixture,
} from './provider-test.fixtures'

const catalog: AiProviderCatalogItem[] = coreProviderCatalogFixture

describe('provider-editor-form', () => {
  it('distinguishes core protocols from preset templates in labels and hints', () => {
    const extendedCatalog: AiProviderCatalogItem[] = [
      ...catalog,
      createCatalogPresetFixture({
        id: 'groq',
        name: 'Groq',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
      }),
    ]

    expect(getCatalogDriverOptions(extendedCatalog)).toEqual([
      expect.objectContaining({ id: 'openai', label: 'OpenAI · 核心协议族' }),
      expect.objectContaining({ id: 'anthropic', label: 'Anthropic · 核心协议族' }),
      expect.objectContaining({ id: 'gemini', label: 'Google Gemini · 核心协议族' }),
      expect.objectContaining({ id: 'groq', label: 'Groq · 目录模板 · OpenAI 协议' }),
    ])
    expect(getProviderDriverHint('catalog', 'groq', extendedCatalog)).toContain(
      '供应商目录模板',
    )
    expect(getProviderDriverHint('protocol', 'anthropic', extendedCatalog)).toContain(
      'Anthropic 协议族',
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

  it('clears stale catalog defaults when switching a new provider to protocol mode', () => {
    const form = reactive(createProviderFormState())

    syncProviderFormState(form, null, catalog)
    form.mode = 'protocol'
    form.driver = 'gemini'
    applyProviderDriverDefaults(form, catalog, null)

    expect(form.id).toBe('gemini')
    expect(form.name).toBe('Gemini 协议接入')
    expect(form.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(form.defaultModel).toBe('')
    expect(form.modelsText).toBe('')
  })
})
