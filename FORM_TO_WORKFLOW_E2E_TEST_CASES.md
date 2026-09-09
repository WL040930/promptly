# Form-to-workflow AI E2E presentation scenario

One short demonstration: Form AI creates a form, Workflow AI uses it, and a test
submission reaches the correct workflow branch.

## Demonstration

Use a fresh writable workspace, a disposable spreadsheet, and a test email inbox.
Do not publish until the proposal is reviewed.

#### Step 1 — Form AI prompt

Open Form AI on a new form and paste:

```text
Please create a simple customer feedback form called "Customer Feedback E2E". I need
the user's name, email, a 1-to-5 rating, comments, and a Yes/No recommendation. Make
everything required except comments. Don't create a workflow or connect any
integrations yet.
```

Review the proposal, then apply it.

#### Step 2 — Workflow AI prompt

Open Workflow AI on a new draft workflow and paste:

```text
I just created "Customer Feedback E2E". Build a workflow triggered by its submissions.
If the rating is 2 or lower, ask for my approval: if approved, save the response to
one shared Excel/Google Sheet called "Customer Feedback Responses" and email the
respondent; if rejected, log "Low-rating feedback rejected" and stop. For higher
ratings, save and email without approval. Include all answers, the response ID, and
submission time, and ask me to connect Google or email if needed.
```

If Workflow AI asks which form to use, choose `Customer Feedback E2E`. Apply the
workflow proposal after reviewing it.

#### Step 3 — Runtime verification

Use the workflow Test Run dialog with this payload, mapping the field names if needed:

```json
{
  "fields": {
    "full_name": "Ava Lim",
    "email": "ava@example.test",
    "rating": 2,
    "comments": "Checkout was confusing and took too long.",
    "recommend": "No"
  },
  "responseId": "response-e2e-low-001",
  "submittedAt": "2026-09-09T09:00:00.000Z"
}
```

For the low rating, test both outcomes: reject the approval once, then run it again
with a new response ID and approve it. Finally, run it with `rating: 5` and
`recommend: "Yes"` to verify the no-approval path.

#### Expected result / pass criteria

- Form AI shows a proposal with the five requested questions before saving.
- Workflow AI uses the saved form as its only `form-submission` trigger.
- The workflow has a rating Condition, a human Approval step, spreadsheet actions, and email actions.
- Rating `2` pauses for approval; approval continues to save the response and send one email.
- Rejection logs `Low-rating feedback rejected` and stops without sending an email.
- Rating `5` saves the response and sends one email without approval.
- One shared spreadsheet contains the submitted answers, response ID, and submission time.
