<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>🦞🧄 Garlic Claw</h1>
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>访问密钥</label>
          <ElInput
            v-model="secret"
            type="password"
            show-password
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <ElButton native-type="submit" type="primary" :loading="submitting">
          {{ submitting ? '登录中...' : '登录' }}
        </ElButton>
        <ElButton
          v-if="isDev"
          class="dev-login"
          native-type="button"
          :disabled="submitting"
          @click="handleDevLogin"
        >
          {{ submitting ? '登录中...' : '开发者一键登录' }}
        </ElButton>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton, ElInput } from 'element-plus'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const secret = ref('')
const error = ref('')
const submitting = ref(false)

const isDev = import.meta.env.DEV && !!import.meta.env.VITE_DEV_LOGIN_SECRET

const devSecret = import.meta.env.VITE_DEV_LOGIN_SECRET as string | undefined

async function doLogin(input: string) {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(input)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message || '登录失败'
  } finally {
    submitting.value = false
  }
}

async function handleLogin() {
  await doLogin(secret.value)
}

async function handleDevLogin() {
  if (devSecret) {
    await doLogin(devSecret)
  }
}
</script>

<style scoped>
.auth-card :deep(.el-button) {
  margin-left: 0;
  padding: 1.25em 0.7em;
}
</style>
