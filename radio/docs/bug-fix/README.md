# Stashbox Radio Bug & Fix Knowledge Base

This directory is the permanent source of truth for Stashbox Radio bugs, fixes, regressions, and reusable repair procedures.

## Purpose

Every material Stashbox Radio defect should leave behind useful repair knowledge. The goal is to avoid rediscovering solved problems and to protect previous fixes from being accidentally undone.

## Required workflow

1. Search this knowledge base before changing code for a reported bug.
2. Match the symptom against prior bug records and repair playbooks.
3. Create a new `SR-BUG-####` record when the issue is new.
4. Record reproduction details before the fix when possible.
5. Record root cause, files changed, commit SHA, and repair steps after the fix.
6. Mark the record `Fixed` only after code/configuration has changed.
7. Mark the record `Verified` only after the repaired behavior has been confirmed.
8. Promote reusable solutions into the repair playbooks.

## Structure

- `BUG_INDEX.md` - human-readable master index.
- `BUG_TEMPLATE.md` - template for new bug records.
- `AGENT_WORKFLOW.md` - mandatory workflow for AI/developer repair sessions.
- `open/` - active bugs and investigations.
- `fixed/` - fixed or verified bug records.
- `repairs/` - reusable repair playbooks by system area.
- `/radio-admin/dev/bugs/bugs.json` - machine-readable registry used by the DEV Bug & Fix admin dashboard.

## Status definitions

- `Open` - reported and not yet diagnosed.
- `Investigating` - diagnosis in progress.
- `Fixed` - repair applied but not yet confirmed by a user/test.
- `Verified` - repaired behavior confirmed.
- `Reopened` - previously fixed issue has returned or verification failed.

## Severity

- `Critical` - outage, data loss, security exposure, publishing failure with major impact.
- `High` - major user-facing function broken or visibly unusable.
- `Medium` - meaningful defect with workaround or limited scope.
- `Low` - cosmetic, minor, or edge-case defect.

## Rule

A bug is not considered complete until its repair knowledge is retained here.