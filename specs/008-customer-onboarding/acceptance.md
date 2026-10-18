# Rendered happy path for coordinator acceptance

Use a synthetic applicant and the same browser session throughout. This procedure is not evidence that native acceptance has already run.

1. At the portal welcome screen choose **Open my first account**, then **Start my application**. This allocates an independent applicant; the shared demo is retained separately.
2. Savings account: confirm the fictional applicant is an adult resident of India; **Save and continue**.
3. Contact: `ananya@example.test`, `DEMO-PHONE-01`; **Complete simulated contact check**, then continue. No message or OTP is sent.
4. Personal: `Demo Ananya Rao`, sample date `1990-01-01`; continue.
5. Address/tax: `Demo 14 Sample Avenue`, Chennai, `600020`, India only, Salaried. **Save draft**, reload, and verify these values remain before continuing.
6. Nominee: add `Demo Kavya Rao`, Sibling; continue. Explicit decline is also a demo-only preference.
7. Identity: **Use sample identity pack**, wait for both records to be saved for branch review, then continue. No real document, PAN, Aadhaar or camera input.
8. Review: inspect/edit sections, accept demo savings terms and confirm the fictional application. **Review submission** moves keyboard focus into confirmation; **Confirm and submit application** submits once. The receipt must say **Submitted for identity review**, with the permanent application reference and no account number yet.
9. **Return to banking portal**. In the demo persona control select **Bank officer**, then **Account opening**. Inspect this applicant's details and sample documents; **Recommend opening**.
10. **Continue as the approver**, then **Approve & open account** exactly once. If the outcome is uncertain, inspect the original opening; do not submit a replacement creation.
11. Reopen `/open-account` in the same session and **Check opening status**. Only an active matching INR Core account produces **Your savings account is open** with the real synthetic Core account number.
12. Reload that receipt, then **Continue to my account**. The customer role, scoped header, account identity and directory registration must remain this applicant's. Confirm existing planning, cash/transfer and other capability navigation remain available. The original shared customer's data must be unchanged.

## Verification boundary

Owned tests cover workflow persistence, concurrency, role/scope restrictions, original-operation recovery and the rendered stepper. Browser fixtures assert scope headers, reload, confirmation focus, primary entry, mobile/200% zoom and own-portal continuation. These fixtures do not prove a deployed Core opening. Finacle5 records native/Core acceptance against the exact integrated source separately.
