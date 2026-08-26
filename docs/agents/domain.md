# Domain Docs

Use these rules when exploring the repository or writing about its domain.

## Before exploring

Read these files when they exist:

- `CONTEXT.md` at the repository root
- ADRs under `docs/adr/` that affect the area being changed

Proceed silently when these files do not exist. The domain-modeling skill creates them when the project resolves relevant terminology or architectural decisions.

## Layout

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use glossary vocabulary

When naming domain concepts in issues, proposals, hypotheses, or tests, use the terms defined in `CONTEXT.md`. Avoid synonyms that the glossary rejects.

A missing concept may indicate either that the proposed language does not fit the project or that the glossary has a genuine gap. Reconsider the term or record the gap for domain modeling.

## Flag ADR conflicts

Surface any conflict with an existing ADR instead of silently overriding it:

> Contradicts ADR-0007 (event-sourced orders), but worth reopening because…
