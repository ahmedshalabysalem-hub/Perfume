# Task template

Copy this block into `docs/TASK_BOARD.md` (or a task file for large tasks) before starting work.

```markdown
### <ID> — <Title>

- **Status:** Backlog | Ready | In Progress | Blocked | Review | Done
- **Priority:** P0 (blocks release) | P1 (current phase) | P2 (next phase) | P3 (later)
- **Effort level:** normal | high | highest — recommendation, see CLAUDE.md §Roles, effort and review
- **Depends on:** <task IDs, decisions or external inputs>

**Objective** — One measurable outcome.

**Context and relevant files** — Docs sections, services, schema files, existing components to reuse.

**Scope** — What will be built or changed.

**Out of scope** — What will deliberately not be touched (and where it is tracked).

**Acceptance criteria**

1. Observable behaviour, written so a reviewer can verify it.
2. …

**Security and data integrity** — Authorization and scope checks, validation, audit entries,
transactions and concurrency, money precision, personal data, migration safety.

**Required tests** — Unit / integration / e2e cases to add or update; checks to run.

**Review** — Self-review of the diff (normal) or a separate review pass against the acceptance
criteria (high/highest); what the reviewer must look at in particular.

**Completion report** — Filled in when the task ends (see below).
```

## Completion report format

```markdown
Task: <ID> — <Title>
Status: Done | Review | In Progress | Blocked (board statuses; a partial or failed task is not Done)
Implemented: <concise list of actual changes>
Files changed: <important paths>
Verification: <commands actually run and their results>
Review: <who/what reviewed it and against which criteria>
Known issues: <remaining problems, external dependencies>
Next task: <ID> — <objective>
```

Rules: report only what was actually run; a failing or skipped check is reported as such; a task
without passing verification is not Done.
