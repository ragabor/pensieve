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

The footer shows a preview of the newest entry and the number of older entries:

```text
stashed: Refactor the authentication middleware… (+2)
```

Stashes do not survive process restarts. Automatic restoration also works after `/model`, manual
`/compact`, and `/reload`; other commands leave the stash pending for manual restoration.

## Installation

Install from GitHub:

```bash
pi install git:github.com/ragabor/pensieve
```

Run `/reload` in an existing Pi session, or start a new Pi process.

## Keybindings

Pensieve uses `Ctrl+S` by default. Set `pensieve.shortcut` in
`~/.pi/agent/keybindings.json` to use another key:

```json
{
  "pensieve.shortcut": "alt+s"
}
```

Run `/reload` after editing the file.

## Development

```bash
bun install --frozen-lockfile
bun run check
```

## License

[KCPL](LICENSE)
