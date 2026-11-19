# README clips

The GIFs in `docs/media/` are recorded from the real app by these scripts: a private X display, a
plain desktop drawn behind the cockpit, fake GitHub and Jira servers with example data, a stand-in
notification server, and Playwright driving the built app. Nothing here touches your own cockpit,
settings or keyring.

| Scene | Clip | What it needs |
| --- | --- | --- |
| `hero` | `hero.gif`: a morning with the cockpit, from the Work screen to the agent that needs you | Claude Code |
| `review` | `review.gif`: the review with a submodule, a comment sent to the agent, the file updating | Claude Code |
| `dropdown` | `dropdown.gif`: the window over the desktop, resized by its edge to full height and back | |
| `work` | `work.gif`: the Work screen, a filter and a pull request opened in the browser | |
| `editor` | `editor.gif`: a file found and opened over the tab, edited and saved by itself, a search in it, a Markdown preview and a compiler's path opened at its line | |

## Requirements

- Linux with `Xvfb`, `xdotool`, `xsetroot`, ImageMagick (`display`, `import`, `montage`), `ffmpeg`,
  `dbus-launch` and `gdbus`.
- Python 3 with Pillow; the notification server also needs dbus-python and PyGObject (on Debian and
  Ubuntu, `python3-dbus` and `python3-gi`; set `MEDIA_DBUS_PYTHON` to a Python that has them).
- Playwright for Node, reachable through `NODE_PATH` (for example `npm install -g playwright` and
  `NODE_PATH=$(npm root -g)`). It drives Electron, so no browser download is needed.
- `pnpm install` and `pnpm build` in this repository.
- For `hero` and `review`, a Claude Code that can answer in a fresh home. The fixture home has no login,
  so pass one through the environment: `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`, or
  `CLAUDE_CONFIG_DIR` pointing to a logged-in configuration). The driver hands these to Claude Code's
  wrapper at run time; no script writes a key anywhere. The agent's work is real, so each take differs a
  little and costs a few requests.

## Record

```bash
pnpm build
scripts/media/run.sh hero          # record; `dry` instead takes screenshots only
scripts/media/make-gif.sh hero     # compose, encode and write a contact sheet
cp ~/.cache/dck-media/out/hero.gif docs/media/
```

`run.sh` rebuilds the fixtures every time: the projects `acme-api` (with the `libs/billing` submodule)
and `acme-web` in the fixture home, a shell prompt, and the Claude Code wrapper; a scene that needs more
runs its own `prep-<scene>.sh` after that (`review` moves the submodule, `editor` adds TypeScript sources
with a type error, a README and `tsc`). The fixture home is
`/home/ana` by default, because the cockpit shows paths under `/home/<name>` as `~/...`; create it
once with `sudo install -d -o "$USER" /home/ana`, or set `MEDIA_HOME` to another empty folder (paths then
show in full). The script refuses to clear a folder it did not create.

Variables: `MEDIA_WORK` (scratch folder, default `~/.cache/dck-media`), `MEDIA_HOME`, `ELECTRON` (default
the repository's own Electron), `MEDIA_DISPLAY` (default `61`), `SCREEN` (default `1280x720`) and
`SHOTS=1` to take the screenshots of a dry run during a recording as well.

## How a clip is made

- `scenes.cjs` holds each clip's starting settings, an off-camera setup and the recorded run, which
  marks its moments by name. Every clip starts and ends with the cockpit open, so the first frame
  GitHub shows before the GIF plays is never a bare desktop.
- `clips.py` times each clip by those marks: speed per segment, the zooms on the part that matters and
  the captions. `compose.py` applies them at 960x540 and draws the captions as the app draws its hint
  bar (a dark card with keycaps, from the dark theme's tokens). `make-gif.sh` encodes the GIF with one
  palette.
- `desktop.py` draws what sits behind the cockpit and the browser pages the fake `xdg-open` shows;
  `notify-server.py` shows notifications as cards and clicks them when the driver asks, through the same
  D-Bus signal a real click sends.

Keep the clips dark, 960 pixels wide, at the same frame rate, and each under about 3 MB, with example
data only (`acme/...`, `example.com`, Ana, Bruno and Carla).
