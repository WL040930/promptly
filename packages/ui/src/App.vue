<template>
  <div id="app">
    <header class="header">
      <h1>🚀 Promptly</h1>
      <p>Full-stack Express.js + Vue.js Application</p>
    </header>
    
    <main class="main">
      <section class="api-status">
        <h2>API Status</h2>
        <div class="status-card" :class="{ 'connected': apiStatus.connected }">
          <p><strong>Backend:</strong> {{ apiStatus.message }}</p>
          <p><strong>Status:</strong> {{ apiStatus.connected ? 'Connected' : 'Disconnected' }}</p>
          <button @click="checkApiStatus" :disabled="loading">
            {{ loading ? 'Checking...' : 'Check Status' }}
          </button>
        </div>
      </section>

      <section class="prompts">
        <h2>Sample Prompts</h2>
        <div class="prompts-container">
          <div v-if="prompts.length > 0" class="prompts-list">
            <div v-for="prompt in prompts" :key="prompt.id" class="prompt-card">
              <h3>{{ prompt.title }}</h3>
              <p>{{ prompt.content }}</p>
            </div>
          </div>
          <div v-else class="no-prompts">
            <p>No prompts available. Check API connection.</p>
          </div>
          <button @click="fetchPrompts" :disabled="loading" class="fetch-btn">
            {{ loading ? 'Loading...' : 'Fetch Prompts' }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
  name: 'App',
  setup() {
    const apiStatus = ref({
      connected: false,
      message: 'Not connected'
    })
    const prompts = ref([])
    const loading = ref(false)

    const checkApiStatus = async () => {
      loading.value = true
      try {
        const response = await fetch('/api/health')
        const data = await response.json()
        apiStatus.value = {
          connected: true,
          message: data.message || 'Connected successfully'
        }
      } catch (error) {
        apiStatus.value = {
          connected: false,
          message: 'Failed to connect to backend'
        }
        console.error('API Status Error:', error)
      } finally {
        loading.value = false
      }
    }

    const fetchPrompts = async () => {
      loading.value = true
      try {
        const response = await fetch('/api/prompts')
        const data = await response.json()
        prompts.value = data.prompts || []
      } catch (error) {
        console.error('Fetch Prompts Error:', error)
        prompts.value = []
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      checkApiStatus()
      fetchPrompts()
    })

    return {
      apiStatus,
      prompts,
      loading,
      checkApiStatus,
      fetchPrompts
    }
  }
}
</script>