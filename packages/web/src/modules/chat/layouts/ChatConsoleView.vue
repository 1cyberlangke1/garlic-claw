<template>
  <div class="chat-console-view">
    <aside class="chat-rail">
      <header class="rail-header">
        <div class="brand-block">
          <h1>聊天工作台</h1>
        </div>
        <button type="button" class="new-chat-button" @click="newChat">
          新对话
        </button>
      </header>

      <div class="conversation-list">
        <button
          v-for="conversation in visibleConversations"
          :key="conversation.id"
          type="button"
          class="conversation-item"
          :data-id="conversation.id"
          :class="{ active: conversation.id === chat.currentConversationId }"
          @click="chat.selectConversation(conversation.id)"
        >
          <span class="conversation-title">{{ conversation.title }}</span>
          <span
            class="conversation-delete"
            role="button"
            tabindex="-1"
            @click.stop="chat.deleteConversation(conversation.id)"
          >
            ×
          </span>
        </button>
      </div>

      <footer class="rail-footer" />
    </aside>

    <main class="chat-content">
      <ChatView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/modules/chat/store/chat'
import ChatView from '@/modules/chat/views/ChatView.vue'
import { computed, onMounted } from 'vue'

const chat = useChatStore()
const visibleConversations = computed(() =>
  chat.conversations.filter((conversation) => !(conversation as { parentId?: string }).parentId),
)

onMounted(() => {
  void chat.loadConversations()
})

async function newChat() {
  const conversation = await chat.createConversation()
  await chat.selectConversation(conversation.id)
}
</script>

<style scoped>
.chat-console-view {
  display: flex;
  min-height: 100%;
  height: 100%;
}

.chat-rail {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--border);
  background: var(--surface-sidebar-gradient);
  backdrop-filter: blur(var(--glass-blur));
}

.rail-header {
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
}

.brand-block {
  display: grid;
  gap: 0.35rem;
}

.brand-block h1 {
  margin: 0;
  font-size: 1.3rem;
}

.new-chat-button {
  width: 100%;
}

.conversation-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 0.75rem 0;
  display: grid;
  gap: 0.45rem;
  align-content: start;
}

.conversation-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  color: var(--text);
  padding: 0.7rem 0.85rem;
}

.conversation-item.active {
  border-color: rgba(103, 199, 207, 0.36);
  background: rgba(103, 199, 207, 0.16);
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.conversation-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  min-height: 1.5rem;
  color: var(--text-muted);
  line-height: 1;
  font-size: 1.05rem;
}

.rail-footer {
  min-height: 16px;
}

.chat-content {
  flex: 1;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
}

@media (max-width: 900px) {
  .chat-console-view {
    flex-direction: column;
  }

  .chat-rail {
    width: 100%;
    min-width: 0;
    max-height: 42vh;
  }

  .chat-content {
    min-height: 0;
  }
}
</style>
