<template>
  <section class="skill-list-panel">
    <div class="panel-header">
      <div>
        <span class="panel-kicker">Catalog</span>
        <h2>技能目录</h2>
        <p>宿主当前能发现的技能目录。模型只会看到其中 `允许加载` 的项。</p>
      </div>
    </div>

    <input
      :value="searchKeyword"
      class="skill-search"
      type="text"
      placeholder="搜索技能名称、说明、标签"
      @input="onSearchInput"
    >

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
  </section>
</template>

<script setup lang="ts">
import type { SkillDetail } from '@garlic-claw/shared'
import SkillCard from './SkillCard.vue'

defineProps<{
  modelValue: string | null
  searchKeyword: string
  skills: SkillDetail[]
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | null): void
  (event: 'update:searchKeyword', value: string): void
}>()

function onSearchInput(event: Event) {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}
</script>
