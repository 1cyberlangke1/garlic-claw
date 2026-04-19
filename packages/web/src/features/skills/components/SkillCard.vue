<template>
  <article
    class="skill-card"
    :class="{ active: selected }"
    @click="$emit('select', skill.id)"
  >
    <div class="skill-card-top">
      <div>
        <strong>{{ skill.name }}</strong>
        <p>{{ skill.description || '当前技能没有额外说明。' }}</p>
      </div>
    </div>
    <div class="meta-row">
      <span class="meta-chip">{{ skill.id }}</span>
      <span class="meta-chip">{{ skill.sourceKind === 'project' ? '项目' : '用户' }}</span>
      <span class="meta-chip">{{ loadPolicyLabel(skill.governance.loadPolicy) }}</span>
      <span class="meta-chip">{{ skill.assets.length }} 个资产</span>
    </div>
    <p v-if="skill.tags.length > 0" class="detail-line">标签: {{ skill.tags.join(' · ') }}</p>
    <p class="detail-line">入口: {{ skill.entryPath }}</p>
    <p v-if="skill.assets.length > 0" class="detail-line">资产: {{ skill.assets.map((asset) => asset.path).join(' · ') }}</p>
  </article>
</template>

<script setup lang="ts">
import type { SkillDetail, SkillLoadPolicy } from '@garlic-claw/shared'

defineProps<{
  skill: SkillDetail
  selected: boolean
}>()

defineEmits<{
  (event: 'select', skillId: string): void
}>()

function loadPolicyLabel(loadPolicy: SkillLoadPolicy): string {
  switch (loadPolicy) {
    case 'deny':
      return '拒绝加载'
    case 'ask':
      return '请求确认'
    default:
      return '允许加载'
  }
}
</script>
