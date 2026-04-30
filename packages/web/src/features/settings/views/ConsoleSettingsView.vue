<script setup lang="ts">
import { useAdminShellPreferences } from '@/features/admin/modules/admin-shell-preferences'
import settingsBold from '@iconify-icons/solar/settings-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import { Icon } from '@iconify/vue'

const {
  topbarPullCordEnabled,
  setTopbarPullCordEnabled,
} = useAdminShellPreferences()

function handleToggleTopbarPullCord() {
  setTopbarPullCordEnabled(!topbarPullCordEnabled.value)
}
</script>

<template>
  <div class="console-settings-page">
    <header class="settings-page-header">
      <div class="settings-hero">
        <span class="settings-kicker">Console Preferences</span>
        <h1>控制台设置</h1>
        <p>这里放置只影响前端控制台体验的本地设置，不会写入后端配置。</p>
      </div>
    </header>

    <section class="settings-card">
      <div class="settings-card-header">
        <div>
          <span class="settings-section-kicker">顶栏交互</span>
          <h2>顶部拉绳收起</h2>
        </div>
        <Icon :icon="magicStick3Bold" class="settings-card-icon" aria-hidden="true" />
      </div>

      <div class="settings-row">
        <div class="settings-copy">
          <div class="settings-copy-title">
            <Icon :icon="settingsBold" class="settings-copy-icon" aria-hidden="true" />
            <strong>启用顶栏拉绳按钮</strong>
          </div>
          <p>开启后，顶栏中间会出现一个可点击的下拉拉绳，用来收起或展开顶部栏。</p>
        </div>

        <button
          type="button"
          class="settings-switch"
          :class="{ 'settings-switch--on': topbarPullCordEnabled }"
          role="switch"
          :aria-checked="topbarPullCordEnabled"
          aria-label="启用顶栏拉绳按钮"
          @click="handleToggleTopbarPullCord"
        >
          <span class="settings-switch__knob" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.console-settings-page {
  min-height: 100%;
  padding: 24px;
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.12), transparent 28%),
    radial-gradient(circle at left 20%, rgba(148, 163, 184, 0.08), transparent 26%),
    var(--shell-bg);
}

.settings-page-header {
  margin-bottom: 24px;
}

.settings-hero {
  max-width: 720px;
}

.settings-kicker,
.settings-section-kicker {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--shell-active);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-hero h1,
.settings-card-header h2 {
  margin: 0;
  color: var(--shell-text);
}

.settings-hero p,
.settings-copy p {
  margin: 8px 0 0;
  color: var(--shell-text-secondary);
  line-height: 1.6;
}

.settings-card {
  max-width: 860px;
  border: 1px solid var(--shell-border);
  border-radius: 20px;
  padding: 24px;
  background: var(--surface-panel-soft-strong);
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.08);
}

.settings-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--shell-border);
}

.settings-card-icon {
  font-size: 24px;
  color: var(--shell-active);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 22px;
}

.settings-copy {
  min-width: 0;
}

.settings-copy-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--shell-text);
}

.settings-copy-icon {
  font-size: 18px;
  color: var(--shell-active);
}

.settings-switch {
  width: 48px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 3px;
  background: rgba(148, 163, 184, 0.35);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.settings-switch--on {
  background: var(--shell-active);
}

.settings-switch__knob {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.16);
  transition: transform 0.2s ease;
}

.settings-switch--on .settings-switch__knob {
  transform: translateX(20px);
}

@media (max-width: 768px) {
  .console-settings-page {
    padding: 16px;
  }

  .settings-card {
    padding: 18px;
  }

  .settings-row {
    align-items: flex-start;
  }
}
</style>
