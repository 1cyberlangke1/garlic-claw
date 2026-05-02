<template>
  <section class="skill-list-column">
    <div class="skill-list-header">
      <span class="skill-list-title">技能目录</span>
      <strong class="skill-list-count">已启用 {{ enabledCount }} / {{ totalCount }}</strong>
    </div>

    <ElInput
      :model-value="searchKeyword"
      class="skill-search field-input"
      placeholder="搜索技能名称、说明、标签"
      @input="onSearchInput"
    />

    <div class="skill-list-shell">
      <div v-if="loading" class="empty-state">加载中...</div>
      <div v-else-if="skills.length === 0" class="empty-state">当前筛选下没有技能。</div>
      <div v-else class="skill-list">
        <SkillCard
          v-for="skill in skills"
          :key="skill.id"
          :skill="skill"
          :selected="modelValue === skill.id"
          @select="(skillId) => $emit('update:modelValue', skillId)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SkillDetail } from '@garlic-claw/shared'
import { ElInput } from 'element-plus'
import SkillCard from './SkillCard.vue'

defineProps<{
  modelValue: string | null
  searchKeyword: string
  enabledCount: number
  totalCount: number
  skills: SkillDetail[]
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | null): void
  (event: 'update:searchKeyword', value: string): void
}>()

function onSearchInput(value: string) {
  emit('update:searchKeyword', value)
}
</script>
