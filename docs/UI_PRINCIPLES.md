# OmniFlow UI Principles

Version: 1.0

---

# Purpose

This document defines the user experience principles of OmniFlow.

It does not describe colors, spacing or typography.

Those rules belong to DESIGN_SYSTEM.md.

This document defines how every screen should behave and how users should experience the product.

Every new feature must respect these principles.

---

# Product Vision

OmniFlow is not a CRUD application.

OmniFlow is an AI Content Operating System.

The interface must help users create, manage and publish content with the minimum number of decisions.

The product should always feel:

* fast
* intelligent
* simple
* predictable
* premium

---

# Core UX Philosophy

Users should never wonder:

* Where am I?
* What should I do next?
* What happens if I click this?
* Is the process finished?

Every screen should answer those questions automatically.

---

# The Rule of One Primary Action

Every screen must have one obvious primary action.

Examples

Dashboard

Primary Action

Generate Content

Projects

Primary Action

Create Project

Generator

Primary Action

Generate Pins

Results

Primary Action

Generate Images

History

Primary Action

View Results

Never compete with multiple primary buttons.

---

# Progressive Disclosure

Do not show everything at once.

Show information only when it becomes useful.

Example

Generator

Show:

Keyword

Language

Project

Pins

Do not show:

Advanced AI parameters

Prompt configuration

Model settings

Those belong to future advanced settings.

---

# AI Workflow

Every AI workflow follows exactly the same pattern.

Input

↓

Generate

↓

Processing

↓

Results

↓

Export

↓

Schedule

↓

Publish

Never change this sequence.

Future generators (WordPress, Facebook, LinkedIn, etc.) must follow the same workflow.

---

# Every Screen Needs a Purpose

Each page must answer one question.

Dashboard

"What is happening?"

Projects

"What am I working on?"

Generator

"What do I want to create?"

Results

"What has AI created?"

History

"What have I already generated?"

Settings

"How do I configure my workspace?"

Avoid screens with multiple unrelated purposes.

---

# Reduce Cognitive Load

Users should make as few decisions as possible.

Prefer:

Good defaults

Automatic suggestions

Pre-selected values

Smart ordering

Instead of asking the user to configure everything.

---

# Important Information First

Visual hierarchy should always follow this order.

Primary Action

↓

Main Content

↓

Secondary Information

↓

Metadata

Users should never read metadata before understanding the main content.

---

# Empty States

An empty page is never acceptable.

Every empty state must contain:

Icon

Title

Description

Primary action

Optional documentation link

Every empty state should encourage the next action.

---

# Loading Experience

Never leave the user wondering.

Every async operation must provide feedback.

Preferred order

Skeleton

↓

Spinner

↓

Progress

↓

Success

↓

Error

Avoid blocking the entire interface.

---

# Error Messages

Errors must explain:

What happened

Why

What the user can do next

Bad

"Unknown Error"

Good

"Image generation failed. Please try again."

Better

"OpenAI image generation failed. Retry in a few seconds."

---

# Success Feedback

Every successful action should provide immediate confirmation.

Use:

Toast

Badge update

Button state

Navigation

Avoid silent success.

---

# Tables

Tables are only for structured datasets.

Do not use tables for rich content.

If content includes:

Images

Descriptions

Actions

Metadata

Prefer cards instead.

---

# Cards

Cards represent objects.

Examples

Project

Generation

Pin

Image

Cards should always expose the most important information first.

---

# Forms

Forms should guide users.

Never overwhelm them.

Rules

Few fields

Clear labels

Helpful placeholders

Logical grouping

Visible validation

Good defaults

---

# AI Screens

AI generation pages are the heart of OmniFlow.

They should never feel like HTML forms.

Instead they should feel like creative workspaces.

Users should immediately understand:

What they are generating

What AI will produce

What happens next

---

# Results Pages

Results pages are the most valuable pages in the product.

Never hide the generated content.

Images should receive visual priority.

Titles should be readable.

Descriptions should not dominate.

Actions should always remain visible.

---

# Scheduling

Scheduling is a post-processing step.

It should never interrupt content generation.

Generate first.

Schedule later.

Publish later.

---

# Navigation

Navigation must always answer:

Where am I?

Where can I go?

Active pages must always be visually obvious.

---

# Search Before Filters

When datasets become large:

Search first.

Filters second.

Sorting third.

Search is usually the fastest way to find content.

---

# Mobile Philosophy

Desktop is the primary experience.

Mobile should remain usable.

Never remove functionality.

Only simplify layout.

---

# Performance

Fast interfaces feel better than beautiful interfaces.

Prefer:

Server Components

Streaming

Optimistic UI

Skeletons

Avoid unnecessary client-side rendering.

---

# Future Platforms

The UX must scale naturally to:

Pinterest

WordPress

Facebook

Instagram

LinkedIn

Medium

Reddit

Threads

Future generators should reuse the same navigation, workflows and interaction patterns.

---

# User Trust

Never surprise the user.

Destructive actions require confirmation.

Long-running tasks require feedback.

Generated content should always be reviewable before export.

---

# Consistency

The same action should always behave the same way.

Generate always means generate.

Delete always means delete.

Schedule always means schedule.

Never change terminology across modules.

---

# Golden Rules

Every new feature must satisfy these questions before implementation.

1. Does it simplify the workflow?

2. Is it visually consistent?

3. Does it reduce user effort?

4. Does it scale to future platforms?

5. Would a first-time user understand it without documentation?

If the answer to any question is "No", redesign before implementation.

---

# Final Principle

The interface should disappear.

Users should focus on creating content, not on learning how to use OmniFlow.
