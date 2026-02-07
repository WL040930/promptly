// Lightweight stubs so the interactive demo works without a backend service.
export async function getGeminiResponse(promptText, history = []) {
  const historyNote = history.length ? ` Considering ${history.length} prior messages.` : ''
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Got it. I will draft an automation for: "${promptText}".${historyNote}`)
    }, 450)
  })
}

export async function analyzeWorkflowTask(promptText) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        category: 'automation-plan',
        steps: [
          `Understand intent: ${promptText}`,
          'Check available integrations and data sources',
          'Draft safe actions with approvals',
          'Prepare execution summary for review'
        ]
      })
    }, 350)
  })
}
