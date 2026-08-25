# Pensieve

Pensieve is a process-memory prompt stack for [Pi](https://github.com/earendil-works/pi).
It lets you put aside an unfinished prompt, handle an interruption, and return to the draft
without copying it elsewhere.

## How it works

Press `Ctrl+S` while the editor contains text. Pensieve clears the editor and puts the exact
expanded text on a last-in, first-out stack. Submit the intervening prompt and Pensieve restores
the newest draft to the empty editor with the cursor at the end.

Stashing again creates another level. If you stash `A`, then stash `B` while dealing with `A`,
submitting the next prompt restores `B`; submitting `B` restores `A`.

Press `Ctrl+S` in an empty editor to restore the newest draft manually.

The footer shows a bounded preview of the newest entry and the number of older entries:

```text
stashed: Refactor the authentication middleware… (+2)
```

Pensieve never overwrites or merges with a nonempty editor. The draft remains pending instead.

## Scope and lifecycle

The stack is:

- held only in process memory;
- shared by every session and project in the same Pi process;
- preserved across `/reload`;
- discarded when Pi exits; and
- unlimited in v1.

Pensieve restores after ordinary prompts, queued steering and follow-up messages, `/model`,
manual `/compact`, and `/reload`. Starting, resuming, forking, or cloning a session carries the
shared stack without popping it. Other commands leave the stack pending; press `Ctrl+S` to restore
manually.

Pensieve stores text only. It does not preserve cursor position, attachments, or structured paste
state. Restored text places the cursor at the end.

## Installation

Install the moving default branch from GitHub:

```bash
pi install git:github.com/ragabor/pensieve
```

Run `/reload` in an existing Pi session, or start a new Pi process.

Pensieve does not publish to npm. GitHub release tags provide stable source checkpoints when you
want to inspect or pin a version.

## Keybindings

Pensieve uses `Ctrl+S` by default. Pi also uses that key to change sorting inside the session
picker. Move the picker action to another key to avoid a shortcut conflict:

```json
{
  "app.session.toggleSort": "alt+s"
}
```

To change Pensieve's shortcut, add `pensieve.shortcut` to
`~/.pi/agent/keybindings.json`. It accepts one key or an array:

```json
{
  "app.session.toggleSort": "alt+s",
  "pensieve.shortcut": ["ctrl+s", "alt+s"]
}
```

Run `/reload` after editing the file.

## Development

Pensieve has no runtime dependencies. Its TypeScript, ESLint, Prettier, and test dependencies are
development-only and locked with Bun.

```bash
bun install --frozen-lockfile
bun run check
```

## License

[WTFPL](LICENSE)
