# Stashbox Radio Repair Workflow

Use this process for Stashbox Radio bug work.

## Before code changes

1. Search `radio/docs/bug-fix/` and `/radio-admin/dev/bugs/bugs.json` for similar symptoms, components, filenames, and previous repairs.
2. Read related files under `radio/docs/bug-fix/repairs/`.
3. Inspect the current code before reusing a previous solution.
4. If the issue is new, assign the next `SR-BUG-####` ID and create a record using `BUG_TEMPLATE.md`.
5. Record both failing examples and working comparisons when available.

## During diagnosis

1. Repair the root cause rather than one named example when possible.
2. Check whether files being changed appear in earlier bug records.
3. Preserve prior repairs unless current evidence shows they should change.
4. Add useful diagnostics to the bug record.

## After a fix

1. Set the bug status to `Fixed`.
2. Record the root cause.
3. Record files changed.
4. Record the commit SHA or deployment identifier.
5. Record regression risks and related bugs.
6. Add a future repair procedure.
7. Update `/radio-admin/dev/bugs/bugs.json`.
8. Update `BUG_INDEX.md`.
9. Add reusable knowledge to the appropriate repair playbook.

## Verification

Keep a repair at `Fixed` until a user, automated test, or production check confirms the result. Then change the status to `Verified` and record the date and verification method.

## If a problem returns

1. Reopen the existing bug when the same root cause returned.
2. Create a related new bug when a different root cause produces the same visible symptom.
3. Compare current code with the previous fixing commit before applying another repair.

Every material repair should leave enough information for a later developer or AI session to understand the symptom, root cause, fix, files, commit, verification, and repair path.