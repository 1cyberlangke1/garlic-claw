import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERNAL_CONFIG_CHANGED_EVENT } from '@/features/ai-settings/internal-config-change'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'
import * as toolData from '@/features/tools/composables/tool-management.data'

vi.mock('@/features/tools/composables/tool-management.data', () => ({
  loadToolOverview: vi.fn(),
  runToolSourceActionRequest: vi.fn(),
  saveToolEnabled: vi.fn(),
  saveToolSourceEnabled: vi.fn(),
  toErrorMessage: vi.fn((error: unknown, fallback: string) => error instanceof Error ? error.message : fallback),
}))

describe('ToolGovernancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(toolData.loadToolOverview).mockResolvedValue({
      sources: [
        {
          kind: 'internal',
          id: 'runtime-tools',
          label: '执行工具',
          enabled: true,
          totalTools: 2,
          enabledTools: 2,
        },
      ],
      tools: [
        {
          toolId: 'internal:runtime-tools:bash',
          name: 'bash',
          callName: 'bash',
          description: '执行命令',
          enabled: true,
          parameters: {},
          sourceKind: 'internal',
          sourceId: 'runtime-tools',
          sourceLabel: '执行工具',
        },
      ],
    })
  })

  it('refreshes itself when matching internal config changes', async () => {
    const wrapper = mount(ToolGovernancePanel, {
      props: {
        sourceKind: 'internal',
        sourceId: 'runtime-tools',
        title: '执行工具管理',
        description: 'demo',
        showSourceList: false,
      },
    })
    await flushPromises()

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'runtime-tools',
      },
    }))
    await flushPromises()

    expect(toolData.loadToolOverview).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('ignores unrelated internal config changes', async () => {
    const wrapper = mount(ToolGovernancePanel, {
      props: {
        sourceKind: 'internal',
        sourceId: 'runtime-tools',
        title: '执行工具管理',
        description: 'demo',
        showSourceList: false,
      },
    })
    await flushPromises()

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'subagent',
      },
    }))
    await flushPromises()

    expect(toolData.loadToolOverview).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
