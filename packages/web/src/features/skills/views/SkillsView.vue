<template>
  <div class="skills-page">
    <section class="skill-hero">
      <header class="skill-hero-header">
        <div>
          <span class="hero-kicker">Skill Catalog</span>
          <h1>技能目录</h1>
          <p>管理宿主可发现的 `SKILL.md` 目录，以及原生 `skill` 工具允许暴露给模型的加载策略。</p>
        </div>
        <div class="hero-actions">
          <button
            type="button"
            class="hero-button icon-only"
            title="刷新目录"
            :disabled="refreshing"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-button-icon" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">技能总数</span>
          <strong>{{ totalCount }}</strong>
          <p>来自项目本地或用户目录的 `SKILL.md` 资产。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">项目技能</span>
          <strong>{{ projectCount }}</strong>
          <p>来自仓库内技能目录，适合团队共用。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">用户技能</span>
          <strong>{{ userCount }}</strong>
          <p>来自用户目录，适合个人私有 workflow。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">已拒绝加载</span>
          <strong>{{ deniedCount }}</strong>
          <p>这些技能不会被原生 `skill` 工具加载。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">技能包</span>
          <strong>{{ packageCount }}</strong>
          <p>其中 {{ executableCount }} 个目录带有可执行脚本资产。</p>
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
      />

      <div class="skill-detail-column">
        <SkillDetailPanel
          :skill="selectedSkill"
          :mutating-skill-id="mutatingSkillId"
          @update-load-policy="handleSkillLoadPolicyUpdate"
        />
        <EventLogSettingsPanel
          v-if="selectedSkill"
          :settings="selectedSkill.governance.eventLog"
          :saving="mutatingSkillId === selectedSkill.id"
          title="技能日志设置"
          description="当前技能自己的事件日志会写到 log/skills/<skillId>/ 目录。"
          @save="handleSkillEventLogUpdate"
        />
        <EventLogPanel
          v-if="selectedSkill"
          title="技能事件日志"
          description="查看技能最近的加载、拒绝与治理动作记录。"
          :events="eventLogs"
          :loading="eventLoading"
          :query="eventQuery"
          :next-cursor="eventNextCursor"
          @refresh="refreshSkillEvents"
          @load-more="loadMoreSkillEvents"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import type { SkillLoadPolicy } from '@garlic-claw/shared'
import SkillDetailPanel from '@/features/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/features/skills/components/SkillsList.vue'
import EventLogPanel from '@/features/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/features/tools/components/EventLogSettingsPanel.vue'
import { useSkillManagement } from '@/features/skills/composables/use-skill-management'
const {
  loading,
  refreshing,
  error,
  mutatingSkillId,
  eventLoading,
  eventLogs,
  eventQuery,
  eventNextCursor,
  searchKeyword,
  filteredSkills,
  selectedSkillId,
  selectedSkill,
  totalCount,
  projectCount,
  userCount,
  deniedCount,
  packageCount,
  executableCount,
  selectSkill,
  updateSkillGovernance,
  refreshSkillEvents,
  loadMoreSkillEvents,
  refreshAll,
} = useSkillManagement()

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

function handleSkillLoadPolicyUpdate(payload: {
  skillId: string
  loadPolicy: SkillLoadPolicy
}) {
  void updateSkillGovernance(payload.skillId, {
    loadPolicy: payload.loadPolicy,
  })
}

function handleSkillEventLogUpdate(payload: { maxFileSizeMb: number }) {
  if (!selectedSkill.value) {
    return
  }

  void updateSkillGovernance(selectedSkill.value.id, {
    eventLog: payload,
  })
}
</script>

<style src="./skills-view.css"></style>
