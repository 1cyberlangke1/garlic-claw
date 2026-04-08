<template>
  <div class="skills-page">
    <section class="skill-hero">
      <header class="skill-hero-header">
        <div>
          <span class="hero-kicker">Skill Workspace</span>
          <h1>Skill 工作台</h1>
          <p>把高层 workflow / prompt 资产挂到当前会话，不再把编排逻辑散落在聊天输入里。</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="hero-button" :disabled="refreshing" @click="refreshAll()">
            {{ refreshing ? '刷新中...' : '刷新目录' }}
          </button>
          <button
            type="button"
            class="hero-button secondary"
            :disabled="!chat.currentConversationId || activeCount === 0"
            @click="clearConversationSkills()"
          >
            清空当前会话
          </button>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">Skill 总数</span>
          <strong>{{ totalCount }}</strong>
          <p>来自项目本地或用户目录的 `SKILL.md` 资产。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">当前会话已激活</span>
          <strong>{{ activeCount }}</strong>
          <p>会话级激活后，会在模型调用前统一注入提示和工具策略。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">Skill Package</span>
          <strong>{{ packageCount }}</strong>
          <p>其中 {{ restrictedCount }} 个还声明了工具 allow / deny 策略。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">本地脚本信任</span>
          <strong>{{ scriptCapableCount }}</strong>
          <p>这些 skill 在当前会话激活后，允许通过统一 skill 工具执行本地脚本。</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="skills-layout">
      <SkillsList
        v-model="selectedSkillIdModel"
        v-model:search-keyword="searchKeyword"
        :skills="filteredSkills"
        :loading="loading"
        :active-skill-ids="conversationSkillState?.activeSkillIds ?? []"
        :mutating-skill-id="mutatingSkillId"
        :current-conversation-id="chat.currentConversationId"
        @toggle-skill="toggleSkill"
      />

      <SkillDetailPanel
        :skill="selectedSkill"
        :conversation-id="chat.currentConversationId"
        :conversation-skill-state="conversationSkillState"
        :mutating-skill-id="mutatingSkillId"
        @toggle-skill="toggleSkill"
        @update-trust-level="handleSkillTrustLevelUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SkillTrustLevel } from '@garlic-claw/shared'
import SkillDetailPanel from '@/features/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/features/skills/components/SkillsList.vue'
import { useSkillManagement } from '@/features/skills/composables/use-skill-management'
import { useChatStore } from '@/features/chat/store/chat'

const chat = useChatStore()
const {
  loading,
  refreshing,
  error,
  mutatingSkillId,
  searchKeyword,
  filteredSkills,
  selectedSkillId,
  selectedSkill,
  conversationSkillState,
  totalCount,
  activeCount,
  restrictedCount,
  packageCount,
  scriptCapableCount,
  selectSkill,
  toggleSkill,
  clearConversationSkills,
  updateSkillGovernance,
  refreshAll,
} = useSkillManagement(chat)

const selectedSkillIdModel = computed({
  get: () => selectedSkillId.value,
  set: (nextSkillId: string | null) => {
    if (!nextSkillId) {
      selectedSkillId.value = null
      return
    }

    selectSkill(nextSkillId)
  },
})

function handleSkillTrustLevelUpdate(payload: {
  skillId: string
  trustLevel: SkillTrustLevel
}) {
  void updateSkillGovernance(payload.skillId, {
    trustLevel: payload.trustLevel,
  })
}
</script>

<style src="./skills-view.css"></style>
