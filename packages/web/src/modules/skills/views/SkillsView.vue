<template>
  <ConsolePage class="skills-page">
    <template #header>
      <ConsoleViewHeader
        v-model="currentView"
        :title="currentView === 'details' ? '技能目录' : '技能日志'"
        :icon="currentView === 'details' ? magicStick3Bold : listCheckBold"
        :view-options="viewOptions"
        aria-label="技能目录视图切换"
      >
        <template #actions>
          <ElButton
            v-if="currentView === 'logs' && selectedSkill"
            class="hero-button icon-only view-header-action"
            :class="{ active: showLogSettings }"
            title="日志设置"
            @click="showLogSettings = !showLogSettings"
          >
            <Icon :icon="settingsBold" class="hero-button-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            class="hero-button icon-only view-header-action"
            title="刷新目录"
            :disabled="refreshing"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-button-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>

      </ConsoleViewHeader>
    </template>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="skills-layout">
      <SkillsList
        v-model="selectedSkillIdModel"
        v-model:search-keyword="searchKeyword"
        :enabled-count="enabledCount"
        :total-count="totalCount"
        :skills="filteredSkills"
        :loading="loading"
      />

      <div v-if="currentView === 'details'" class="skill-detail-column">
        <SkillDetailPanel
          :skill="selectedSkill"
          :mutating-skill-id="mutatingSkillId"
          @update-load-policy="handleSkillLoadPolicyUpdate"
        />
      </div>

      <div v-else-if="selectedSkill" class="skill-log-column">
        <EventLogSettingsPanel
          v-if="showLogSettings"
          :settings="selectedSkill.governance.eventLog"
          :saving="mutatingSkillId === selectedSkill.id"
          title="技能日志设置"
          description="此技能的事件日志会写入 log/skills/<skillId>/ 目录。"
          @save="handleSkillEventLogUpdate"
        />
        <EventLogPanel
          title="技能事件日志"
          description="查看技能最近的加载和拒绝记录。"
          :events="eventLogs"
          :loading="eventLoading"
          :query="eventQuery"
          :next-cursor="eventNextCursor"
          @refresh="refreshSkillEvents"
          @load-more="loadMoreSkillEvents"
        />
      </div>

      <div v-else class="skill-log-column">
        <section class="skill-log-empty">
          请先从左侧选择一个技能，再查看事件日志。
        </section>
      </div>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import { ElButton } from 'element-plus'
import type { SkillLoadPolicy } from '@garlic-claw/shared'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import SkillDetailPanel from '@/modules/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/modules/skills/components/SkillsList.vue'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import { useSkillManagement } from '@/modules/skills/composables/use-skill-management'

type SkillsPageView = 'details' | 'logs'
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
  enabledCount,
  totalCount,
  selectSkill,
  updateSkillGovernance,
  refreshSkillEvents,
  loadMoreSkillEvents,
  refreshAll,
} = useSkillManagement()

const currentView = ref<SkillsPageView>('details')
const showLogSettings = ref(false)
const viewOptions: ReadonlyArray<{ label: string; value: SkillsPageView }> = [
  { label: '详情', value: 'details' },
  { label: '日志', value: 'logs' },
]

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

<style>
.skills-page .skill-list-panel,
.skills-page .skill-detail-panel,
.skills-page .skills-layout,
.skills-page .panel-header,
.skills-page .skill-card-top,
.skills-page .meta-row {
  display: flex;
  gap: 0.9rem;
}

.skills-page .skill-list-panel,
.skills-page .skill-detail-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  padding: 1rem;
}

.skills-page .skill-list-panel,
.skills-page .skill-detail-panel,
.skills-page .skill-list,
.skills-page .active-skill-list {
  display: flex;
  flex-direction: column;
}

.skills-page .panel-header,
.skills-page .skill-card-top {
  justify-content: space-between;
}

.skills-page .skills-layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  align-items: start;
}

.skills-page .skill-list-panel {
  min-width: 0;
}

.skills-page .skill-detail-column {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
}

.skills-page .skill-log-column {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
}

.skills-page .skill-detail-panel {
  width: 100%;
}

.skills-page .skill-log-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: 1rem;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-muted);
}

.skills-page .skill-search {
  margin: 1rem 0 0.75rem;
}

.skills-page .panel-header {
  align-items: flex-start;
}

.skills-page .panel-header-summary {
  flex-shrink: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.skills-page .skill-list,
.skills-page .active-skill-list {
  gap: 0.75rem;
}

.skills-page .active-skill-card,
.skills-page .skill-preview {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem;
}

.skills-page .skill-preview {
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
}

.skills-page .governance-panel,
.skills-page .asset-section,
.skills-page .asset-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.skills-page .skill-card {
  display: grid;
  gap: 0.75rem;
  cursor: pointer;
  border: 1px solid var(--border);
  border-left: 4px solid var(--success);
  border-radius: 12px;
  padding: 0.95rem 1rem;
  background: var(--surface-panel);
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.skills-page .skill-card.active {
  border-color: rgba(76, 189, 255, 0.35);
  box-shadow: 0 0 0 1px rgba(76, 189, 255, 0.18);
}

.skills-page .skill-card.policy-allow {
  border-left-color: var(--success);
}

.skills-page .skill-card.policy-ask {
  border-left-color: #f0b24b;
}

.skills-page .skill-card.policy-deny {
  border-left-color: #f36c6c;
}

.skills-page .skill-card-title {
  display: block;
  font-size: 0.95rem;
}

.skills-page .skill-card-description {
  margin-top: 0.3rem;
  color: var(--text-muted);
}

.skills-page .skill-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.skills-page .skill-card-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.74rem;
}

.skills-page .skill-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.skills-page .skill-card-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-page .toggle-button,
.skills-page .hero-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.skills-page .toggle-button.secondary,
.skills-page .hero-button.secondary {
  color: var(--text-muted);
}

.skills-page .hero-button.active {
  border-color: rgba(76, 189, 255, 0.4);
  background: rgba(76, 189, 255, 0.08);
}

.skills-page .toggle-button:disabled,
.skills-page .hero-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.skills-page .meta-row {
  flex-wrap: wrap;
}

.skills-page .meta-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.skills-page .meta-chip.active-chip {
  border-color: rgba(89, 207, 155, 0.35);
  color: var(--success);
}

.skills-page .meta-chip.governance-enabled {
  border-color: rgba(76, 189, 255, 0.3);
  color: var(--accent);
}

.skills-page .meta-chip.governance-disabled {
  border-color: rgba(255, 107, 107, 0.35);
  color: var(--danger);
}

.skills-page .detail-line,
.skills-page .empty-state {
  color: var(--text-muted);
}

.skills-page .muted-text {
  color: var(--text-muted);
}

.skills-page .warning-text {
  color: #b77c15;
}

.skills-page .governance-panel,
.skills-page .asset-section {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
  padding: 0.9rem;
  background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
}

.skills-page .governance-actions,
.skills-page .asset-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.skills-page .trust-level-field {
  display: grid;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.skills-page .trust-level-field select {
  min-width: 160px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  padding: 0.4rem 0.75rem;
}

.skills-page .asset-list {
  display: grid;
  gap: 0.75rem;
}

.skills-page .asset-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}

.skills-page .empty-state.compact {
  padding: 0;
}

.skills-page .markdown-preview {
  margin-top: 1rem;
  color: var(--text);
}

.skills-page .markdown-preview h1,
.skills-page .markdown-preview h2,
.skills-page .markdown-preview h3 {
  margin-top: 0.8rem;
  margin-bottom: 0.45rem;
}

.skills-page .markdown-preview p,
.skills-page .markdown-preview li {
  line-height: 1.6;
}

.skills-page .markdown-preview ol,
.skills-page .markdown-preview ul {
  padding-left: 1.5rem;
}

@media (max-width: 1100px) {
  .skills-page .skills-layout {
    grid-template-columns: 1fr;
  }

  .skills-page .skill-detail-panel {
    width: 100%;
  }

  .skills-page .skill-detail-column {
    width: 100%;
  }

  .skills-page .skill-log-column {
    width: 100%;
  }

  .skills-page .panel-header,
  .skills-page .skill-card-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .skills-page .governance-actions,
  .skills-page .asset-header {
    align-items: flex-start;
  }
}


</style>
