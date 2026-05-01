<template>
  <div class="skills-page">
    <ConsoleViewHeader
      v-model="currentView"
      :title="currentView === 'details' ? '技能目录' : '技能日志'"
      :icon="currentView === 'details' ? magicStick3Bold : listCheckBold"
      :view-options="viewOptions"
      aria-label="技能目录视图切换"
    >
      <template #actions>
          <ElButton
            class="hero-button icon-only view-header-action"
            title="刷新目录"
            :disabled="refreshing"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-button-icon view-header-action-icon" aria-hidden="true" />
          </ElButton>
      </template>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">技能总数</span>
          <strong>{{ totalCount }}</strong>
          <p>来自仓库根 `skills/` 目录的 `SKILL.md` 资产。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">skills 目录</span>
          <strong>{{ directoryCount }}</strong>
          <p>从仓库根 `skills/` 目录扫描 skill，方便共享与版本管理。</p>
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
    </ConsoleViewHeader>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="skills-layout">
      <SkillsList
        v-model="selectedSkillIdModel"
        v-model:search-keyword="searchKeyword"
        :skills="filteredSkills"
        :loading="loading"
      />

      <div v-if="currentView === 'details'" class="skill-detail-column">
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
          description="此技能的事件日志会写入 log/skills/<skillId>/ 目录。"
          @save="handleSkillEventLogUpdate"
        />
      </div>

      <div v-else-if="selectedSkill" class="skill-log-column">
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import { ElButton } from 'element-plus'
import type { SkillLoadPolicy } from '@garlic-claw/shared'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import SkillDetailPanel from '@/modules/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/modules/skills/components/SkillsList.vue'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
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
  totalCount,
  directoryCount,
  deniedCount,
  packageCount,
  executableCount,
  selectSkill,
  updateSkillGovernance,
  refreshSkillEvents,
  loadMoreSkillEvents,
  refreshAll,
} = useSkillManagement()

const currentView = ref<SkillsPageView>('details')
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

<style src="./skills-view.css"></style>
