---
description: Vérifie et met à jour la documentation après une tâche de développement
allowed-tools: Read, Edit, Bash(git diff:*), Bash(git status:*)
---

Analyse les changements de code de cette session (`git diff HEAD`, `git status`) et propose une mise à jour de la documentation cohérente avec le style existant du projet. Ne rien appliquer avant l'étape 5.

## 1. Identifier les fichiers touchés

Liste les fichiers modifiés/ajoutés sous `app/`, `lib/`, `components/`, `supabase/migrations/`, `types/`.

## 2. Router chaque zone touchée vers son doc

* `supabase/migrations/` ou requêtes DB (`lib/queries/`) → `docs/DATABASE.md`
* `app/api/**/route.ts` → `docs/API.md`
* Composants/pages (`components/`, `app/(dashboard)/`) → `docs/UI_UX.md`
* `lib/ai/`, nouveaux dossiers `lib/*`, changement d'architecture/pattern → `docs/ARCHITECTURE.md`
* Fonctionnalité produit nouvelle/modifiée → `docs/PROJECT.md`
* Feature visible par l'utilisateur final → `lib/guide/content.ts` (Guide in-app) — règle déjà actée dans CLAUDE.md ("Documentation Discipline": toute feature user-facing doit mettre à jour le Guide en même temps qu'elle ship)

Pour chaque doc concerné, vérifie s'il reflète encore la réalité du code (ne propose une modification que si un écart existe réellement — ne pas réécrire une section déjà à jour).

## 3. TASKS.md — entrée de tâche complétée

Format exact à reproduire (voir les entrées existantes dans `docs/TASKS.md`, section `# COMPLETED TASKS`) :

```txt
## [TASK-XXX] Titre court — YYYY-MM-DD

* Bullet technique, référence directe aux fichiers/fonctions touchés (`chemin/fichier.ts` `nomFonction()`)
* Explique le "pourquoi" seulement quand ce n'est pas évident (root cause, contrainte découverte en testant, decision de scope)
* Dernière ligne : périmètre inchangé si pertinent ("Zero changes to X/Y/Z")

---
```

Si la tâche a un numéro déjà présent au statut PLANNED dans la section ROADMAP, déplace-la vers COMPLETED TASKS (ne duplique pas l'entrée) et retire/actualise sa mention dans ROADMAP/MVP CHECKLIST.

## 4. CHANGELOG.md — nouvelle entrée de version

Format exact à reproduire (voir les entrées existantes dans `docs/CHANGELOG.md`) :

```txt
# [x.y.z] - YYYY-MM-DD

## TASK-XXX: Titre

### Added / Changed / Fixed / Removed

* Bullet utilisateur-orienté ou technique selon le cas, même ton que l'historique

Ligne de clôture en prose précisant l'impact schéma/API ("No database migration", "No API contract changes", etc.)

---
```

Détermine le bump de version selon les règles déjà définies en bas de `docs/CHANGELOG.md` (Versioning Rules) :
* Patch (x.y.Z) — bug fix, refactor, perf
* Minor (x.Y.0) — nouvelle feature
* Major (X.0.0) — changement d'architecture ou de direction produit majeur

## 5. Résumé avant application

Affiche un résumé de toutes les modifications de documentation proposées (fichier par fichier, diff-style) et attends ma confirmation explicite avant d'éditer quoi que ce soit. Ne modifie aucun fichier hors documentation (`docs/*.md`, `lib/guide/content.ts`).
