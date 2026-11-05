# Pending distribution gate

Department accounts must resolve their active allocations before using the normal views. The list includes expired, preparing, missing-file and signed-but-incomplete allocations. Cancelled allocations are excluded. DCC administrators remain able to approve requests and cancel distributions. Mandatory password changes are shown before the gate. The gate allows sign-out and retries its Firestore subscriptions when they fail; cached-only results are not treated as an authoritative empty list.

A new signed receipt starts with `transferStatus: PENDING`. The download endpoint records server-only delivery evidence for the specific account, receipt attempt and current file paths. The completion callable requires that evidence and records each file, or every file in the ZIP. Chrome's file picker reports completion after its writable stream closes. Browsers without that API use an ordinary download and ask the recipient to confirm that the file appeared in their downloads folder; the application cannot inspect their disk in that fallback. The requesting account may resume a signed incomplete transfer. If another account must take over, DCC reopens that department in the existing distribution. If a distribution was cancelled while open, its allocation disappears automatically.

Existing receipts have no transfer status; they retain their original completed interpretation. The system cannot determine retrospectively whether a legacy download actually finished. An expired superseded revision may not be eligible for reopening; DCC must review or cancel an allocation that is no longer required.

## Rollout order

Deploy the four Cloud Functions **before** publishing the web app. Publishing the frontend without the new function and the updated download endpoint would leave newly signed transfers pending. The `dcs_controlled_delivery_evidence` collection is server-only under the existing default-deny Firestore rule; no rules deployment is required.

```sh
npx --yes firebase-tools deploy --project dar-online-form --only functions:completeControlledTransfer,functions:downloadControlledCopyFile,functions:normalizeQaQcDepartments,functions:cancelDistributionDepartment
```

Verify that every listed function deployed successfully. Only then merge the frontend into `main` and wait for the GitHub Pages deployment. Ask open web-app sessions to reload. Old, still-open frontend versions do not create the new transfer state, so enforcement applies once the updated frontend is loaded.
