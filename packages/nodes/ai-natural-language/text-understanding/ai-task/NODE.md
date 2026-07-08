---
title: "AI Task"
type: ai
subType: aiTask
description: "Run any LLM operation — summarize, extract, classify, sentiment, or custom prompt"
ui:
  icon: sparkles
  color: text-indigo-600
  bgColor: bg-indigo-50
  borderColor: border-indigo-200
  shadow: shadow-indigo-100
---

# AI Task Node

## When to use this node
Use this single node for any text-based AI operation. Select the task type to get purpose-built defaults, or choose "Custom Prompt" for full control.

## Task Types
- **Custom Prompt** — Full control. Write your own prompt template with `{{variables}}`.
- **Summarize** — Condenses long text into a concise summary.
- **Extract Data** — Pulls structured fields from unstructured text using a JSON schema.
- **Sentiment Analysis** — Returns `positive`, `negative`, or `neutral` with a confidence score.
- **Categorize / Classify** — Routes text into one of several categories you define.

## Output
Always returns `response` (the AI's text output) and `tokensUsed` (number).
For Extract Data, `response` will be a JSON object matching the extraction schema you define.
