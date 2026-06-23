# CLAUDE.md

# Claude Code Instructions

This file contains Claude Code specific instructions.

Project documentation lives in:

```txt id="m2y7k4"
docs/*
```

Claude must always follow those documents.

If instructions conflict:

```txt id="j8r4v1"
RULES.md
```

has priority.

---

# Working Philosophy

Prefer:

* Small changes
* Predictable changes
* Incremental delivery

Avoid:

* Large refactors
* Architecture rewrites
* Scope expansion

---

# First Action

Before writing code:

Read:

```txt id="u5n9w3"
AGENT.md
```

Then follow the documented reading order.

---

# Task Execution Process

For every task:

## Step 1

Understand active task.

Read:

```txt id="g3k7m8"
docs/TASKS.md
```

---

## Step 2

Identify:

```txt id="r4p8n2"
Goal

Allowed files

Success criteria
```

---

## Step 3

Create implementation plan.

Before coding, explain:

```txt id="f9t5v7"
Files to modify

Changes to make

Potential risks
```

---

## Step 4

Implement.

Keep changes minimal.

---

## Step 5

Run validation.

Read:

```txt id="d7x1k9"
docs/TESTING.md
```

Execute relevant tests.

---

## Step 6

Verify success criteria.

Only then consider task completed.

---

# Coding Standards

## TypeScript

Required:

```txt id="n2q6r4"
strict mode
```

Avoid:

```ts id="b5w8m1"
any
```

---

## Components

Prefer:

```txt id="s8j3v6"
Server Components
```

Use Client Components only when needed.

---

## State Management

Use:

```txt id="z4m7n1"
React Query

useState
```

Avoid introducing new state libraries.

---

## Forms

Validate using:

```txt id="k1v9p5"
Zod
```

---

## API Routes

Always:

```txt id="w6r2t8"
Validate input

Validate auth

Validate ownership

Return typed response
```

---

# Database Safety

Before changing database:

Verify:

```txt id="h7p4m2"
DATABASE.md
```

If schema changes:

Update documentation.

Never create undocumented tables.

---

# Documentation Discipline

Whenever functionality changes:

Update documentation.

Examples:

```txt id="c9n5r1"
Database → DATABASE.md

API → API.md

UI → UI_UX.md

Product → PROJECT.md
```

---

# Credit System Rules

Before any generation:

Verify credits.

Required order:

```txt id="x3k8m6"
Check Credits
↓
Execute Generation
↓
Register Transaction
↓
Update Balance
```

---

# OpenRouter Rules

Use centralized wrappers only.

Never call OpenRouter directly from:

```txt id="y2m6n4"
Components

Pages

Hooks
```

---

# Security Rules

Never expose:

```txt id="v7r1k3"
API Keys

Secrets

Service Role Keys
```

to the browser.

---

# What Claude Must Avoid

Do not:

* Invent endpoints
* Invent database tables
* Invent product features
* Change architecture
* Modify unrelated files
* Add dependencies unnecessarily

---

# When Unsure

Stop.

Explain the ambiguity.

Ask for clarification before implementation.

---

# Completion Rules

A task is complete only when:

* Success criteria met
* Relevant tests pass
* Documentation updated
* TASKS.md updated
* CHANGELOG.md updated

Otherwise:

```txt id="q5n2w8"
Task is not complete.
```
