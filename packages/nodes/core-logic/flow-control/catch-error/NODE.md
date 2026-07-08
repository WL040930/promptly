---
title: "Catch Error"
type: logic
subType: catchError
description: "Handle workflow failures gracefully — send alerts, log errors, or route to a recovery path"
ui:
  icon: shield-alert
  color: text-red-600
  bgColor: bg-red-50
  borderColor: border-red-200
  shadow: shadow-red-100
---

# Catch Error Node

## When to use this node
Connect this node's input from a node that may fail (e.g., HTTP Request, AI Task). If the upstream node's `success` is `false` or throws, this node activates and gives you access to the error details, so you can send an alert, log the failure, or take a recovery action.

## How it works
The engine passes the failed node's error information (including message and which node failed) into the execution context. This node reads that info and makes it available to downstream error-handling nodes.

## Typical patterns
1. `HTTP Request` → `Catch Error` → `Send Email` (alert on failure)
2. `AI Task` → `Catch Error` → `Set Variable` (store error) → `Format Response` (return error to caller)
