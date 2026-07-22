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
Transform JSON data with a sandboxed JavaScript function. The code can read `input`, `variables`, and `metadata`, and must return a JSON-serializable value.

## Configuration Schema
The code runs in a separate restricted worker. Filesystem, network, imports, secrets, and child processes are unavailable.
