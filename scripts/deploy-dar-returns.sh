#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test -f firebase.json
npm --prefix functions install
node --check functions/index.js
node --check functions/darRevisionWorkflow.js
npx --yes firebase-tools@15.34.1 deploy --project dar-online-form --only "firestore:rules,storage,functions:prepareDarPreviousRevision,functions:confirmDocumentReturn,functions:syncDocumentReturnRequests,functions:stampControlledCopies,functions:createAutomaticDistributionFromDar,functions:deleteDarDraft,functions:downloadDarAttachmentFile,functions:manageDistributionRecord,functions:cancelDistributionDepartment"
