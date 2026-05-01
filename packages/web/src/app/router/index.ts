import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/shared/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'admin-shell',
      component: () => import('@/modules/admin/layouts/AdminConsoleLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'chat',
          component: () => import('@/modules/chat/layouts/ChatConsoleView.vue'),
        },
        {
          path: 'devices',
          redirect: { name: 'plugins' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          component: () => import('@/modules/plugins/views/PluginsView.vue'),
        },
        {
          path: 'personas',
          name: 'persona-settings',
          component: () => import('@/modules/personas/views/PersonaSettingsView.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('@/modules/tools/views/ToolsView.vue'),
        },
        {
          path: 'mcp',
          name: 'mcp',
          component: () => import('@/modules/mcp/views/McpView.vue'),
        },
        {
          path: 'skills',
          name: 'skills',
          component: () => import('@/modules/skills/views/SkillsView.vue'),
        },
        {
          path: 'commands',
          name: 'commands',
          component: () => import('@/modules/commands/views/CommandsView.vue'),
        },
        {
          path: 'subagents',
          name: 'subagents',
          component: () => import('@/modules/subagents/views/SubagentView.vue'),
        },
        {
          path: 'automations',
          name: 'automations',
          component: () => import('@/modules/automations/views/AutomationsView.vue'),
        },
        {
          path: 'ai',
          name: 'ai-settings',
          component: () => import('@/modules/ai-settings/views/ProviderSettings.vue'),
        },
        {
          path: 'settings',
          name: 'console-settings',
          component: () => import('@/modules/settings/views/ConsoleSettingsView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureInitialized()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login' }
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return { name: 'chat' }
  }
})

export default router
