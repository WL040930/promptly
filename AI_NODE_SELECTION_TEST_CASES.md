# Targeted AI workflow test cases

This suite covers only the requested areas:

- AI Task in **Custom Prompt** mode
- Approval
- Condition / if–else
- Every enabled trigger
- Every enabled integration action

Other utility and control-flow nodes are intentionally excluded. Copy only the text inside a scenario code block into Promptly AI; keep the answer key and payloads out of the request.

## How to run

1. Use a new empty workflow for each scenario.
2. Paste the scenario unchanged into Workflow AI or Ask Promptly.
3. Review the proposed node keys, configuration, and connections before applying.
4. Use the matching payload/event below for a Test Run or published-trigger smoke test.
5. Use disposable resources and test inboxes for integration actions. A Test Run is not a general sandbox for external side effects.

An executable workflow must have exactly one trigger. Trigger scenarios are separate workflows.

## Scenario prompts

### S01 — AI Task custom prompt for support triage

```text
Build a draft workflow for a customer-support intake endpoint. Each request contains a free-text customer message. Use an AI Task in Custom Prompt mode—not a built-in summarize, extract, sentiment, or categorize mode—to produce a concise internal triage note containing the customer name, urgency, product area, and one-sentence summary. Record the AI result in the run history.
```

### S05 — Require approval before a purchase request continues

```text
Build a draft workflow for purchase requests. Add a manager Approval step before the request continues. If approved, continue to an ordinary Logger step named “Purchase approved”. If rejected, continue to an ordinary Logger step named “Purchase rejected” and include the rejection reason. Do not call an external purchase system or send email in this test.
```

### S07 — Numeric condition with if/else routes

```text
Build a draft workflow for leave requests. Compare remainingLeaveDays with requestedLeaveDays using a numeric Condition. If remainingLeaveDays is greater than or equal to requestedLeaveDays, send the request to a Logger step named “Leave eligible”. Otherwise, send it to a Logger step named “Insufficient leave”. Both true and false routes must be present.
```

### S14 — Read Promptly records for an admin report

```text
Build a draft workflow for a morning admin report. Read the ten most recently updated Promptly forms owned by the current user, ordered newest first, and record the count and returned records. This must be read-only and must not create, update, or delete anything.
```

### S15 — List calendar events without changing them

```text
Build a draft workflow that lists upcoming events from a calendar I choose and records the result. It must not create, edit, or cancel any event. If the calendar connection or selection is missing, ask me for it.
```

### S16 — Search connected Drive files

```text
Build a draft workflow that searches my connected Google Drive for files related to `promptly-node-test` and records the matching file list. It must not upload, download, rename, or delete anything. If Drive is not connected, ask me to connect it.
```

### S17 — Read an existing spreadsheet range

```text
Build a draft workflow that reads a range from a test spreadsheet and records the unformatted cell values. I will choose the spreadsheet and range. It must not append, update, or clear any cells.
```

### S18 — Create a disposable tracking spreadsheet

```text
Build a draft workflow that creates a new disposable spreadsheet named `Promptly Node Test - Safe to Delete`. Its first tab should be named `NodeTest` and have columns for name, status, and amount. Record the new file link and identifier. Ask me to connect Google if needed.
```

### S19 — Call a read-only REST endpoint

```text
Build a draft workflow that makes a read-only GET request to https://httpbin.org/json, requests JSON, and records the response status, success flag, and parsed body. Do not use authentication.
```

### S20 — Send one confirmation email

```text
Build a draft workflow that sends exactly one plain-text confirmation email with subject `Promptly node test` and body `This is a safe node test.` Send it only to a test inbox that I select, then record the delivery result. If no email provider or test inbox is configured, ask me for it.
```

### S21 — Trigger when a Promptly form is created

```text
Build a draft workflow that starts whenever a new Promptly form is created. Record the created record ID, resource type, and changed data in the run history. Explain how I can publish it and verify it with one disposable test form.
```

### S22 — Trigger on a matching incoming email

```text
Build a draft workflow that starts when the connected inbox receives an email whose subject includes `PROMPTLY_NODE_TEST`. Record the sender, subject, body, and received payload. If Gmail is not connected, ask me to connect it. Explain how I can publish it and verify it with one matching test email.
```

### S23 — Trigger when a spreadsheet row is appended

```text
Build a draft workflow that starts when someone adds a new row to a spreadsheet range that I choose. Ignore existing rows when the workflow is first activated. Record the new row data in the run history. Explain how I can publish it and verify it with one appended test row.
```

### S24 — Trigger from an Ask Promptly invocation

```text
Build a draft workflow that a teammate can invoke from Ask Promptly by saying “record a node test message”. It needs one required text parameter named `message`, should record the original chat message and validated parameter, and should require normal approval before a live run. Explain the exact chat request I should send to verify it.
```

### S25 — Trigger when a selected form is submitted

```text
Build a draft workflow that starts when someone submits a test form that I select. Record the submitted fields, response ID, and submission time. If I have not selected a form yet, ask me to choose one. Explain how I can publish it and verify it with one test submission.
```

### S26 — Trigger every weekday morning

```text
Build a draft workflow that runs every weekday at 09:00 and records when it ran and the schedule that started it. Explain how I can use a Test Run to verify it immediately without waiting for the next scheduled time.
```

### S27 — Trigger from an external webhook request

```text
Build a draft endpoint for a partner system to send JSON requests to us. Record the request method, headers, and body, then reply synchronously with HTTP 200 and JSON `{ "ok": true, "source": "node-test" }`. If request verification is needed, ask me to supply a secret instead of inventing one. Explain the POST payload I should send to test the generated endpoint.
```

## Sample payloads and trigger events

For S01, S05, S07, and S14–S20, paste the JSON into the Test Run dialog after creating the workflow. For S21–S27, use the event sample for a downstream smoke test and verify the published trigger with the real event. Replace every `REPLACE_...` value with a disposable resource you control.

#### Payload for S01

```json
{
  "body": {
    "message": "Hi, I am Maya Tan (maya@example.test). The mobile app crashes when I check out. I need help today."
  }
}
```

#### Payload for S05

```json
{
  "body": {
    "requestId": "PR-NODE-001",
    "requester": "maya@example.test",
    "amount": 750,
    "purpose": "Replacement monitor"
  }
}
```

#### Payload for S07

```json
{
  "body": {
    "employeeId": "EMP-NODE-001",
    "remainingLeaveDays": 2,
    "requestedLeaveDays": 3,
    "startDate": "2026-10-12"
  }
}
```

Use `remainingLeaveDays: 5` to exercise the true route.

#### Payload for S14

```json
{
  "body": { "reportRunId": "FORMS-REPORT-NODE-001" }
}
```

#### Payload for S15

```json
{
  "body": { "reportRunId": "CALENDAR-NODE-001" }
}
```

Choose a disposable calendar in the workflow configuration.

#### Payload for S16

```json
{
  "body": { "searchTerm": "promptly-node-test" }
}
```

#### Payload for S17

```json
{
  "body": { "readRunId": "SHEETS-READ-NODE-001" }
}
```

Choose the test spreadsheet and range in the workflow configuration.

#### Payload for S18

```json
{
  "body": { "provisioningRunId": "SHEETS-CREATE-NODE-001" }
}
```

#### Payload for S19

```json
{
  "body": { "requestId": "HTTP-NODE-001" }
}
```

#### Payload for S20

```json
{
  "body": { "deliveryRunId": "EMAIL-NODE-001" }
}
```

Choose an inbox you own. Do not use an `example.test` address for a live email test.

#### Event sample for S21

```json
{
  "resource": "forms",
  "event": "created",
  "recordId": "form_node_test_001",
  "before": null,
  "after": { "id": "form_node_test_001", "title": "Node Test Form" },
  "changedFields": ["title"]
}
```

#### Event sample for S22

```json
{
  "from": "sender@example.test",
  "subject": "PROMPTLY_NODE_TEST Invoice",
  "body": "Invoice INV-NODE-001 is attached.",
  "labels": ["INBOX"]
}
```

#### Event sample for S23

```json
{
  "spreadsheetId": "REPLACE_WITH_TEST_SPREADSHEET_ID",
  "range": "NodeTest!A:C",
  "row": ["Ava Lim", "gold", "2026-10-15T09:00:00Z"]
}
```

#### Event sample for S24

```json
{
  "message": "record a node test message",
  "parameters": { "message": "hello from the node-selection suite" },
  "sessionId": "session-node-test-001"
}
```

#### Event sample for S25

```json
{
  "fields": { "name": "Ava Lim", "email": "ava@example.test", "reason": "Node test" },
  "responseId": "response-node-test-001",
  "submittedAt": "2026-10-15T09:00:00Z"
}
```

#### Event sample for S26

```json
{}
```

Use Test Run for an immediate smoke test, then verify the live schedule separately.

#### Event sample for S27

```json
{
  "body": {
    "requestId": "PARTNER-NODE-001",
    "event": "partner.node-test",
    "accountId": "account-test-001"
  },
  "headers": {
    "content-type": "application/json",
    "x-request-id": "PARTNER-NODE-001"
  },
  "method": "POST"
}
```

## Answer key

Do not include this section when you paste a scenario into the AI.

| Scenario | Expected primary node | Minimum evidence for a pass |
| --- | --- | --- |
| S01 | `ai:aiTask` | Uses `taskType: custom`, a non-empty custom prompt, and returns the requested triage note. |
| S05 | `logic:approval` | Has approved and rejected routes, each continuing to an ordinary Logger action. |
| S07 | `logic:condition` | Uses `greater_than_or_equal` with both true and false routes. |
| S14 | `action:database` | Performs a read-only select of Promptly forms. |
| S15 | `action:googleCalendar` | Lists calendar events without mutating the calendar. |
| S16 | `action:googleDrive` | Searches Drive without transferring or changing a file. |
| S17 | `action:googleSheets` | Reads a selected range without altering cells. |
| S18 | `action:googleSheetsCreate` | Creates and initializes the disposable spreadsheet. |
| S19 | `action:http` | Executes the specified unauthenticated GET and exposes status/body. |
| S20 | `action:email` | Sends exactly one email only to the supplied test inbox. |
| S21 | `trigger:database` | Starts on a Promptly form-created event. |
| S22 | `trigger:email` | Starts only for an email whose subject matches the filter. |
| S23 | `trigger:googleSheets` | Starts when a new row is appended to the selected range. |
| S24 | `trigger:agent` | Accepts the required `message` parameter through Ask Promptly approval. |
| S25 | `trigger:form-submission` | Starts on a submission from the selected form. |
| S26 | `trigger:schedule` | Configures a weekday 09:00 schedule. |
| S27 | `trigger:webhook` | Captures method, headers, and body and returns the requested JSON response. |

## Suite completion check

The targeted suite is complete when all 17 retained scenarios pass. Record OAuth, resource-selection, email-delivery, or network problems separately from incorrect AI node selection.
