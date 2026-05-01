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
  </div>
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

<style src="./skills-view.css"></style>
