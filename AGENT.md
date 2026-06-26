# AGENT.md

# OmniFlow Agent Operating Instructions

This file is the entry point for all AI coding agents working on OmniFlow.

Applies to:

* Claude Code
* OpenCode
* Cursor Agent
* Gemini CLI
* GPT-based coding agents

Before writing any code, follow this document.

---

# Mission

Your mission is to help develop OmniFlow safely, incrementally and predictably.

Do not optimize for speed.

Optimize for:

1. Correctness
2. Maintainability
3. Consistency
4. Documentation compliance

---

# Required Reading Order

Before starting any task, read documents in this exact order:

## Step 1

Read:

```txt id="wqv6z1"
docs/PROJECT.md
```

Understand:

* Product vision
* MVP scope
* Supported features
* Out-of-scope features

---

## Step 2

Read:

```txt id="xt3g7d"
docs/TASKS.md
```

Identify:

* Active task
* Allowed scope
* Success criteria

Work ONLY on the active task.

---

## Step 3

Read:

```txt id="j4c8v0"
docs/RULES.md
```

All rules are mandatory.

---

## Step 4

Read:

```txt id="e2d1r9"
docs/ARCHITECTURE.md
```

Understand:

* Folder structure
* Data flow
* Technical constraints

---

## Step 5

Read:

```txt id="z5m7n3"
docs/DATABASE.md
```

Before touching:

* Tables
* Queries
* Migrations
* RLS

---

## Step 6

Read:

```txt id="f8q2k6"
docs/API.md
```

Before creating:

* Endpoints
* Requests
* Responses

---

## Step 7

Read:

```txt id="r1x9p4"
docs/UI_UX.md
```

Before creating:

* Pages
* Forms
* Components

---

## Step 8

Read (before any Frontend work):

```txt
docs/DESIGN_SYSTEM.md
docs/UI_PRINCIPLES.md
docs/COMPONENT_STANDARDS.md
```

Before creating or modifying:

* Components
* Pages
* Layouts
* Visual styles

---

## Step 9

Read:

```txt id="u7n3w8"
docs/TESTING.md
```

Before declaring a task complete.

---

# Working Rules

## Work Only On Active Task

Do not implement future tasks.

Do not implement backlog items.

Do not add "nice to have" features.

Implement only the active task.

---

## Small Changes Only

Prefer:

```txt id="d9y5h2"
Small focused commits
```

Avoid:

```txt id="b3k7v1"
Large multi-feature changes
```

---

## No Unrequested Refactors

Do not:

* Rename files
* Move folders
* Refactor modules

unless required by the task.

---

## No Scope Expansion

If a task asks:

```txt id="m4r8t6"
Create CSV Export
```

Do not also implement:

```txt id="w2j5q9"
Pinterest API
Image Generation
Analytics
```

---

# Database Rules

Before modifying database schema:

1. Read DATABASE.md
2. Verify table design
3. Verify relationships
4. Verify RLS requirements

If schema changes:

Update:

```txt id="p8x4s7"
docs/DATABASE.md
```

---

# API Rules

Before creating endpoints:

Read:

```txt id="h6v2z1"
docs/API.md
```

Do not invent:

* Endpoints
* Request formats
* Response formats

---

# UI Rules

Before creating UI:

Read:

```txt id="q9w5n4"
docs/UI_UX.md
```

Do not invent:

* New pages
* New flows
* New forms

unless explicitly requested.

---

# AI Rules

All AI operations must go through:

```txt id="c4j8m2"
OpenRouter
```

Use centralized wrappers only.

Never call providers directly from:

* Components
* Pages
* Hooks

Required flow:

```txt id="n7t3k5"
UI
↓
API Route
↓
Business Logic
↓
OpenRouter
```

---

# Security Rules

Always verify:

```txt id="s1y8v4"
Authentication
Ownership
Credits
```

before processing user actions.

Never trust client-side IDs.

---

# Documentation Rules

If implementation changes documentation:

Update documentation immediately.

Examples:

### Database Change

Update:

```txt id="l3x7q8"
DATABASE.md
```

---

### API Change

Update:

```txt id="k8r2v5"
API.md
```

---

### UI Change

Update:

```txt id="j5m9w1"
UI_UX.md
```

---

### Product Change

Update:

```txt id="v2n6p3"
PROJECT.md
```

---

# Completion Checklist

Before marking any task complete:

## Verify

* Code builds successfully
* TypeScript passes
* ESLint passes
* Tests pass
* Success criteria achieved

---

## Update

Update:

```txt id="g7y4m8"
docs/TASKS.md
docs/CHANGELOG.md
```

---

# If Something Is Unclear

Do not assume.

Stop and ask for clarification.

---

# Out Of Scope Protection

Do not implement features that are not present in:

```txt id="r6q1w9"
PROJECT.md
```

Current examples:

```txt id="t3k8n5"
Pinterest OAuth
Pinterest API
Teams
Analytics
Mobile App
```

remain out of scope.

WordPress and SEO Articles are part of the official roadmap (see TASKS.md). Only implement when the corresponding TASK is the active task.

---

# Golden Rule

When documentation and code disagree:

Documentation is the source of truth.

Read the documentation again before making changes.
