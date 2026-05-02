<template>
  <article
    class="skill-card"
    :class="[statusClass(skill.governance.loadPolicy), { active: selected }]"
    @click="$emit('select', skill.id)"
  >
    <div class="skill-card-top">
      <div>
        <strong class="skill-card-title">{{ skill.name }}</strong>
        <p class="skill-card-description">{{ skill.description || '当前技能没有额外说明。' }}</p>
      </div>
    </div>
    <div v-if="skill.tags.length > 0" class="skill-card-tags">
      <span v-for="tag in skill.tags" :key="tag" class="skill-card-tag">
        {{ tag }}
      </span>
    </div>
    <div class="skill-card-footer">
      <span class="skill-card-path">{{ skill.entryPath }}</span>
      <span class="skill-card-assets">{{ skill.assets.length }} 个资产</span>
    </div>
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

function statusClass(loadPolicy: SkillLoadPolicy): string {
  switch (loadPolicy) {
    case 'deny':
      return 'policy-deny'
    case 'ask':
      return 'policy-ask'
    default:
      return 'policy-allow'
  }
}
</script>
