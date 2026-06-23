# CHANGELOG.md

# OmniFlow Changelog

Todos los cambios relevantes del proyecto deben registrarse aquí.

Formato:

```txt id="f9uxqy"
Fecha
Versión
Cambios
```

No registrar cambios menores de formato o comentarios.

---

# [Unreleased]

## Planned

MVP en construcción.

---

# [0.2.0] - 2026-06-23

## TASK-001: Project Foundation Setup

### Added

* Next.js 15 with App Router and TypeScript (strict mode)
* Tailwind CSS v4 + Shadcn UI components (button, input, card, label)
* Supabase Auth integration (login, register, logout)
* Auth middleware for route protection
* Auth callback route for PKCE flow
* Login page with email/password and Zod validation
* Register page with email/password/confirm and Zod validation
* Dashboard placeholder (protected route)
* ApiResponse type definition
* ESLint + Prettier configuration
* .env.example with Supabase variables
* README.md with setup instructions

---

# [0.1.0] - 2026-06-23

## Project Initialization

### Added

* PROJECT.md
* ARCHITECTURE.md
* DATABASE.md
* API.md
* UI_UX.md
* RULES.md
* DECISIONS.md
* TASKS.md
* TESTING.md
* DEPLOYMENT.md
* CHANGELOG.md

### Defined

* Pinterest-First MVP strategy
* CSV Export workflow
* OpenRouter as AI provider
* Supabase as backend platform
* Stripe for credits
* Inngest for background jobs

### Removed

* WordPress MVP scope
* SEO Articles MVP scope
* Pinterest API dependency
* Pinterest OAuth dependency

---

# Versioning Rules

## Major Version

Increment:

```txt id="4vkafm"
1.0.0 → 2.0.0
```

When:

* Major architecture changes
* Major product direction changes

---

## Minor Version

Increment:

```txt id="6g94er"
1.0.0 → 1.1.0
```

When:

* New feature added

Examples:

```txt id="v8h1zw"
CSV Export
History Module
Credits System
```

---

## Patch Version

Increment:

```txt id="jw83si"
1.0.0 → 1.0.1
```

When:

* Bug fixes
* Refactors
* Performance improvements

---

# Example Entries

## [0.2.0] - YYYY-MM-DD

### Added

* Projects Module
* Project CRUD

### Changed

* Updated dashboard navigation

---

## [0.3.0] - YYYY-MM-DD

### Added

* Pinterest Generator
* OpenRouter Integration

### Changed

* Improved generation workflow

---

## [0.4.0] - YYYY-MM-DD

### Added

* CSV Export

### Fixed

* Character count validation

---

# Changelog Rules

Every completed task must update:

```txt id="hqvyhz"
TASKS.md
CHANGELOG.md
```

before being considered finished.

If a feature is visible to users, it must appear in the changelog.
