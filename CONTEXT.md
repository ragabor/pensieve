# Pensieve

Pensieve holds unfinished prompt drafts while a person handles an interruption, then returns those drafts in reverse stash order.

## Language

**Prompt draft**:
The exact editor text put aside for later completion.
_Avoid_: Saved prompt, buffered prompt

**Draft stack**:
The process-wide collection of stashed prompt drafts. The newest prompt draft is restored first.
_Avoid_: Draft queue, prompt history

**Stash**:
Putting a nonempty prompt draft aside on the draft stack.
_Avoid_: Save, park

**Restore**:
Returning the newest prompt draft from the draft stack to an empty editor.
_Avoid_: Load, recover

**Restoration trigger**:
An occurrence that asks Pensieve to consider restoring a prompt draft. A restoration trigger does not guarantee restoration.
_Avoid_: Lifecycle event

**Draft restoration policy**:
The rules that decide whether a restoration trigger restores a prompt draft.
_Avoid_: Lifecycle policy
