---
title: "AI Agent Message"
type: trigger
subType: agent
description: "Trigger an approved workflow from Ask Promptly chat"
ui:
  icon: message
  color: text-orange-600
  bgColor: bg-orange-50
  borderColor: border-orange-200
  shadow: shadow-orange-100
---

# AI Agent Message Node

## When to use this node
Use this trigger when a user should be able to ask Ask Promptly to run a published automation in ordinary language. The AI selects only workflows whose chat invocation is enabled, fills their declared parameters, and always asks for approval before the live run.

## Configuration Schema
- `chatEnabled`: Set to `true` before the published workflow is eligible for Ask Promptly chat.
- `invocationKey`: A stable lowercase key, for example `email-matched-sheet-rows`.
- `description`: Explain what the workflow does and when it should be selected.
- `parameters`: Up to 20 simple fields (`name`, `type`, `description`, `required`).
- `parameterSchema`: Optional advanced flat JSON Schema that overrides `parameters`.
