---
title: "Custom Node (JS)"
type: logic
subType: customCode
implementationStatus: beta
description: "Write custom JavaScript"
ui:
  icon: code
  color: text-blue-500
  bgColor: bg-blue-50
  borderColor: border-blue-200
  shadow: shadow-blue-100
---

# Custom JavaScript Node

## When to use this node
Transform JSON data with a sandboxed JavaScript function. `input` is the previous connected step's `outputData` (a Promptly Form supplies its submitted fields), while `variables` and `metadata` provide workflow context. The function must return a JSON-serializable value.

## Configuration Schema
The code runs in a separate restricted worker. Filesystem, network, imports, secrets, and child processes are unavailable.
