# Pensieve

Pensieve is a process-memory prompt stack for [Pi](https://github.com/earendil-works/pi).

Press `Ctrl+S` while writing a prompt to put the draft aside. Pensieve clears the editor so you
can handle an interruption, then restores the draft after the intervening prompt finishes
submitting. Stash again to nest interruptions; Pensieve unwinds them in last-in, first-out order.

Pensieve never writes prompt text to disk and never replaces a nonempty editor.

> [!NOTE]
> Pensieve is under initial development. Installation and configuration instructions will be
> completed before the first release.

## License

[WTFPL](LICENSE)
