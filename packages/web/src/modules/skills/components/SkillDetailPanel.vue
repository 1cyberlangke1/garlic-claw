<template>
  <aside class="skill-detail-panel">
    <article v-if="skill" class="skill-preview">
      <header class="preview-header">
        <div>
          <h3>{{ skill.name }}</h3>
        </div>
        <div class="meta-row">
          <span class="meta-chip">skills/</span>
          <span class="meta-chip">{{ skill.entryPath }}</span>
        </div>
      </header>

      <p class="detail-line">{{ skill.description }}</p>
      <section class="governance-panel">
        <div class="meta-row">
          <span class="meta-chip">{{ loadPolicyLabel(skill.governance.loadPolicy) }}</span>
          <span class="meta-chip">{{ skill.assets.length }} 个资产</span>
        </div>
        <p class="detail-line muted-text">
          {{ loadPolicyDescription(skill.governance.loadPolicy) }}
        </p>
        <p class="detail-line muted-text">
          `skill` 是原生按需加载工具，不会再绑定到当前会话，也不会自动把提示常驻注入每一轮主聊天。
        </p>
        <p class="detail-line muted-text">
          当前宿主只从仓库根 `skills/` 目录扫描 skill；与执行环境相关的 staging 与 bash 语义后续再接入。
        </p>
        <div class="governance-actions">
          <label class="trust-level-field">
            <span>加载策略</span>
            <ElSelect
              :model-value="skill.governance.loadPolicy"
              :disabled="selectedSkillBusy"
              @change="setSelectedSkillLoadPolicy"
            >
              <ElOption
                v-for="option in loadPolicyOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </ElSelect>
          </label>
        </div>
      </section>
      <section class="asset-section">
        <header class="asset-header">
          <div>
            <h4>目录资产</h4>
          </div>
          <span class="meta-chip">{{ skill.assets.length }} 项</span>
        </header>
        <p class="detail-line muted-text">
          目录资产只用于帮助模型理解这个 skill 带了哪些模板、脚本和参考资料。
        </p>
        <div v-if="skill.assets.length === 0" class="empty-state compact">
          当前技能没有附属资产。
        </div>
        <div v-else class="asset-list">
          <article
            v-for="asset in skill.assets"
            :key="asset.path"
            class="asset-card"
          >
            <strong>{{ asset.path }}</strong>
            <div class="meta-row">
              <span class="meta-chip">{{ assetKindLabel(asset.kind) }}</span>
              <span v-if="asset.textReadable" class="meta-chip governance-enabled">可读</span>
              <span v-if="asset.executable" class="meta-chip active-chip">可执行</span>
            </div>
          </article>
        </div>
      </section>

      <div class="markdown-preview gc-markdown" v-html="renderedSkillContent" />
    </article>
  </aside>
</template>

<script setup lang="ts">
import type {
  SkillAssetKind,
  SkillDetail,
  SkillLoadPolicy,
} from '@garlic-claw/shared';
import { ElOption, ElSelect } from 'element-plus';
import { computed } from 'vue';
import { renderMarkdown } from '@/shared/utils/markdown'

const props = defineProps<{
  skill: SkillDetail | null
  mutatingSkillId: string | null
}>()

const emit = defineEmits<{
  (event: 'update-load-policy', payload: { skillId: string, loadPolicy: SkillLoadPolicy }): void
}>()

const loadPolicyOptions: Array<{
  value: SkillLoadPolicy
  label: string
}> = [
  {
    value: 'allow',
    label: '允许加载',
  },
  {
    value: 'ask',
    label: '请求确认',
  },
  {
    value: 'deny',
    label: '禁用技能',
  },
]

const selectedSkillBusy = computed(() =>
  props.skill ? props.mutatingSkillId === props.skill.id : false,
)

const renderedSkillContent = computed(() => {
  if (!props.skill) {
    return ''
  }

  return renderMarkdown(props.skill.content)
})

function setSelectedSkillLoadPolicy(nextLoadPolicy: SkillLoadPolicy) {
  if (!props.skill) {
    return
  }

  if (nextLoadPolicy === props.skill.governance.loadPolicy) {
    return
  }

  emit('update-load-policy', {
    skillId: props.skill.id,
    loadPolicy: nextLoadPolicy,
  })
}

function loadPolicyLabel(loadPolicy: SkillLoadPolicy): string {
  switch (loadPolicy) {
    case 'deny':
      return '禁用技能'
    case 'ask':
      return '请求确认'
    default:
      return '允许加载'
  }
}

function loadPolicyDescription(loadPolicy: SkillLoadPolicy): string {
  switch (loadPolicy) {
    case 'deny':
      return '宿主不会向模型暴露这个 skill，原生 `skill` 工具也不能加载它。'
    case 'ask':
      return '这个 skill 会出现在目录里，但应当先确认再加载。当前前端只展示状态，不做额外交互。'
    default:
      return '这个 skill 会出现在原生 `skill` 工具描述中，模型可按需懒加载其完整内容。'
  }
}

function assetKindLabel(kind: SkillAssetKind): string {
  switch (kind) {
    case 'script':
      return '脚本'
    case 'template':
      return '模板'
    case 'reference':
      return '参考'
    case 'asset':
      return '资源'
    default:
      return '其他'
  }
}
</script>
