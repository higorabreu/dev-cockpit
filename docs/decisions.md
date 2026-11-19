# Decisions

A short record of the decisions that shape the project, with the reason and how to revert each one.
New entries go at the end; a reverted decision gets a "Reverted on" line instead of being deleted.

## D1. Pure core with ports and per-platform adapters

**Decision:** `core` imports nothing from outside; everything that touches the system (PTY, global
shortcut, notification, secret store, window, git, files, clock, HTTP) sits behind a port and is
implemented in `adapters/`.
**Reason:** the app must be easy to port to macOS and Windows. This ruled out GTK with VTE, which only
runs on Linux.
**Revert:** not revertable; it is the project's dependency rule.

## D2. Daemon separate from the interface

**Decision:** the core runs as a daemon; the window, the CLI and the MCP server are its clients.
**Reason:** the MCP server is started by the Claude CLI and the app may be closed. It also makes the
shell replaceable.

## D3. Electron, with a performance budget and a replacement criterion

**Decision:** all TypeScript with Electron, xterm.js and node-pty. Proposed budgets: key echo in 16 ms,
hotkey to visible window under 100 ms, idle memory under 300 MB, cold start under 2 s.
**Reason:** a single language, the most mature terminal (VS Code's is xterm.js) and simple portability.
Rust is not installed on the author's machine.
**Accepted tension:** Electron weighs more than Tauri, and one premise is to be light. The spike measured it.
**Revert:** if the budgets are exceeded, swap the shell for Tauri; the daemon and the UI are
independent of it.

**Update: Electron confirmed by the spike.** Measured in milestone 0: 218 MB idle with 3 tabs and the DOM
renderer (no daemon), key echo in 2 ms to parse, first frame in 0.31 s. Electron stays; the exit to Tauri
remains open.

## D4. Embedded terminal, not a Guake companion

**Decision:** the app is the terminal itself, with a single window and a side panel.
**Reason:** the author wants one place to work, with the session tied to the task. The cheaper
alternative (driving Guake through its CLI and intercepting approvals with a hook) was recommended, but
the author chose the embedded one.
**Accepted cost:** terminal fidelity becomes the project's responsibility.
**Revert:** if fidelity proves insufficient, go back to the companion model.

## D5. Modules as a code boundary before external plugins

**Decision:** modules are folders with a manifest and clean interfaces. An external plugin contract
(isolated process, JSON-RPC) only after two real connectors. The first concrete connectors are Jira and
GitLab.
**Reason:** abstraction before the second case usually comes out wrong, and there is a single user.

## D6. Views as saved queries; the system of record owns the state

**Decision:** never mirror the board. Each view is a query, and only the result is stored. Requesting a
review or assigning is a write to Jira or GitLab; the system notifies, and the app reads the state back.

## D7. External writes only with approval

**Decision:** any write to Jira, GitLab or files of other repositories requires user approval, with an
action log that allows undoing when possible. Promoted permission rules are written to Claude Code's
`settings.json`, not to a parallel system.
**Reason:** a minimal rule while the full security model (prompt injection through ticket and MR text) is
postponed.

## D8. Standards as data

**Decision:** branch, commit, PR, review rubric and style standards become typed data (zod) that
generates per-agent instructions, MCP tools and validators (hook and CI). First as files with a CLI
(`render` and `check`); the visual editor comes later, in milestone 3.
**Open:** whether the repositories' CLAUDE.md files and skills are generated files or remain the source,
with the app only reading and validating.

## D9. Name

**Decision:** Dev Cockpit, package `devcockpit`, command `dck`. The name "Órbita" belonged only to the
visual draft. `dev-cockpit` already exists on npm (a terminal package), and `cockpit` collides with Red
Hat's Cockpit on Linux.
**Missing:** confirm that `dck` does not collide in other package managers.

## D10. Design system with its own tokens

**Decision:** `packages/design/tokens.json` as the source, Radix UI for accessibility and Tailwind for
styling. A calm, dense direction, without an AI look. Terminal and panel share the palette.

## D11. The "review comment becomes a rule" loop leaves the roadmap

**Decision:** the loop stops being the central differentiator and leaves milestone 3.
**Reason:** the milestone 0 spike found no signal: in a three-month sample of the author's own merge
requests there were no human comments, only system notes.
**Reassess:** if reviews start to happen in merge request comments, or by mining the comments the author
writes when reviewing other people's MRs, to form their own rubric.

## D12. Hold menu

**Decision:** holding the right Ctrl for 180 ms opens a compact menu; releasing runs the highlighted
item. A wheel with 5 categories (Tabs, Projects, Agent, Panel, System) and, beside it, the list of the
category's items. Left and right switch the category, up and down the item, Esc cancels. Releasing
without having navigated does nothing. Icons only on the wheel, never in the list. Each item shows its
direct shortcut, so the user memorizes it over time.
**Tab switching:** with the trigger held, Space opens a picker of tabs by most recent use, with each
session's state, and the previous tab already marked.
**Projects:** the list is ordered by the most recent interaction (open, return to the tab or use).
**Opening:** the menu opens at the center, with no category and no list. The first arrow picks the
sector in that direction (up, right, down, left) and only then does the category list open, outside the
wheel, in the direction of the sector. Releasing at the center does nothing. In the project list, each
item carries a small, discreet folder.
**Essential:** only frequent items that have no comfortable direct key remain. Opacity and font leave the
menu. Permission mode, model switching and Claude's background tasks become panel buttons, not menu items.
**Reason:** the Alt+Tab pattern, hold, choose and release, is fast and needs no memorizing.
**Points of attention:** the trigger must be configurable; any other key within the threshold cancels
the gesture, and the arrows only navigate after the menu opens, so a quick right Ctrl plus arrow is still
word jumping. Never-opened projects show up by the repository's recent activity.

## D13. Approved shortcuts

Four groups, all outside the keys Claude Code uses (Ctrl+C, D, G, L, O, R, V, B, T, S, Z, Alt+B, F, D, Y,
P, T, O, M, Esc, Shift+Tab, Ctrl+Enter, PgUp, PgDn, Ctrl+Home and End, and Ctrl+Shift+C when there is a
selection): window (F9 or F12, F11, Ctrl+Shift+Up and Down, Ctrl+Shift+L, Ctrl plus and minus), tabs
(Alt+1 to 9, Ctrl+Shift+T, Ctrl+Shift+W, Ctrl+Tab), panel and navigation (Ctrl+Shift+P palette,
Ctrl+Shift+B panel, Ctrl+Shift+O projects) and agent flow (Ctrl+Shift+D diff, Ctrl+Shift+E its layout (D48), Ctrl+Shift+J next waiting
session, Ctrl+Shift+Y and N to approve and deny). The first prototype's Ctrl+K and Ctrl+B were dropped
because they collide with Claude.

## D14. Terminal: renderer, copy and paste

**Decision:** xterm 6's DOM renderer (WebGL and canvas draw the wrong font in this environment).
Selecting copies and shows a notice in the bottom right corner with the character count; right and
middle click always paste, with no exception (what Claude and terminals like PuTTY do); Ctrl+Shift+C only
copies when xterm has a selection, otherwise it passes through to Claude. F11 is captured before xterm.
Electron 45 does not expose the clipboard in the renderer, so copy and paste go through the main process
over IPC (the core's Clipboard port); calls are asynchronous and, on X11, the two clipboard areas move
together.

## D15. Window

Frameless, transparent, always on top, without a taskbar entry, anchored to the top of the monitor where
the mouse is, at half height, with F11 for full height. Tabs sit at the bottom in the anchored window and
at the top at full height, with an animated transition. Adjustable opacity, a neutral dark theme and a
light theme, a default font of 16 px, and its own discreet scrollbar. On X11 with 3 monitors, the window
manager ignored the requested position before showing the window when it was the origin (0,0), and the
window landed on another monitor. The fix is to reapply the bounds right after `show`.

## D16. Tabs

Right click on a tab opens its options (close, close others, duplicate) and dragging reorders the tabs,
with Alt+1 to 9 following the new order. Ctrl+Shift+T opens a tab in the current project and
Ctrl+Shift+W closes the current one. To navigate: Ctrl+Tab goes to the next tab and Ctrl+Shift+Tab to
the previous, always in bar order and wrapping around (Ctrl+PgDn and Ctrl+PgUp stay as equivalent
shortcuts). The last used tab stays in the hold menu's tab picker (right Ctrl plus Space), which already
marks the previous one. The menu offers next and previous, besides new and close. Approve and deny become
Ctrl+Shift+Y and N, because Alt+Y belongs to Claude.

## D17. Accessibility: WCAG 2.2 AA

**Decision:** the project follows WCAG 2.2 level AA in both themes, with text contrast of 4.5:1 and icon
and indicator contrast of 3:1, verified by a test over the tokens (`packages/design`).
**Reason:** the wheel icons were almost invisible in both themes. The cause was not only color: a CSS
rule painted the icon stroke with the surface color, and fading through `opacity` reduced contrast even
more. The checker also found two real failures: the shortcut beside the items (3.7:1 and 3.5:1) and the
projects folder (2.1:1 and 1.9:1).
**Practical rule:** no `opacity` to fade text or icons; a solid token color.
**Wheel icons:** idle icons use a solid color that mixes 80% of the text color with the surface, which
gives the lightness of about 20% transparency without `opacity` and keeps contrast above 7:1 in both
themes.

## D18. Adapters organized by technology

**Decision:** adapters live in `packages/adapters/` by technology, not by operating system: `node-pty`
(PTY, already portable across Linux, macOS and Windows), `electron` (window, screen, global shortcut and
clipboard, which only exist inside Electron) and, later, one per system for what is truly
system-specific, such as the secret store (libsecret on Linux).
**Reason:** the split by system that the plan foresaw does not match reality: the global shortcut and the
window depend on Electron, not on Linux. This way, replacing the shell with Tauri replaces a single adapter.
**Rule:** logic (like the `DockController`) lives in `core` and is tested with fakes; the adapter only
translates the port to the technology's API.

## D19. Errors and protocol: adopted standards

**IPC:** JSON-RPC 2.0 (jsonrpc.org), in single-line JSON messages. Request, response, error and
notification follow the specification; daemon events are notifications (no `id`). The error carries the
numeric JSON-RPC `code` (-32601 unknown method, -32602 invalid parameters, -32603 internal error, range
-32099 to -32000 for application errors) and, in `data`, the `DCK-DOMAIN-SEQ` code, the category and
whether retrying is worthwhile.
**Catalog:** `packages/core/error-codes.json` keeps, for each code, the category (inspired by the
canonical gRPC codes and Google's AIP-193: `invalid_argument`, `not_found`, `already_exists`,
`permission_denied`, `unavailable`, `internal`), `retryable` and the JSON-RPC code. Tests guarantee
format, code range, uniqueness and that no code goes unused. The message text lives in the i18n
catalogs as `error.<code>` (see D34).
**CLI:** exit codes from sysexits.h: 0 success, 64 incorrect usage, 69 service unavailable (daemon down
or no window connected), 70 internal error, 1 general failure. The error category decides the exit code.
**Failures:** an expected failure returns `Result`; exceptions only for bugs. No internal detail in the
response (an unexpected error becomes `DCK-IPC-002` and the detail goes to the log).
**References for later:** RFC 9457 (Problem Details) if there is an HTTP API; RFC 5424 for log level
names; W3C Trace Context if calls must be correlated across processes.

## D20. Claude approvals postponed

**Decision:** the approvals banner (`PermissionRequest` hook plus daemon) leaves milestone 1 and returns
after the week of real use. Milestone 1 closes with terminal, tabs, menu, projects and a minimal panel.
**Reason:** the author prefers to validate the shell day to day before intercepting Claude's requests;
the terminal's normal prompt keeps working without the app. The milestone 0 spike already proved the
mechanism.
**How to revert:** reopen the approvals task in the roadmap.

## D21. Side panel v2

**Decision:** the panel gets a thin rail, always visible on the right, with one icon per section
(Sessions, Git, Environment, Claude). Clicking an icon opens the panel at that section; sections are
collapsible and the state is stored. The width is adjustable by dragging the edge. At full height the
panel opens by itself. The panel is read-only, except for switching tabs through Sessions.
**Content:** Sessions of all tabs with state and a finished notice (`Ctrl+Shift+J` goes to the next one,
plus a system notification when a background tab finishes); Git with changed files, last commit, ahead
and behind, a ticket chip extracted from the branch and submodules with pending changes (outdated parent
pointer); Environment with the compose containers and only the state of each; Claude with the session's
context and cost. Pinned favorites on top of the project list in the menu and in the search.
**Refinements after the prototype:** neutral design system palette, with color only on the pending bump
notice (a stopped container is a state, not a problem, and open ports were removed). Git follows VS
Code's Source Control: collapsible groups with counts (Staged, Changes, to push, Submodules), a file
row with name, dimmed folder beside it and a state letter on the right (M, A, D, U, with D struck
through), and commits to push as a short list.
**Out of this round:** run time per tab, exit code, merge or rebase in progress, commit conformance,
project commands, notes per project and contextual shortcuts. MRs, pipeline and ticket title depend on
the milestone 2 connectors.
**Risks:** Claude consumption reads the internal format of `~/.claude/projects`, which may change;
"Claude running" depends on the process being named `claude`; containers and ports weigh more than git,
so they are only read with the panel open. Pinning favorites is an action, so the "read-only" rule needs
an exception for it.

## D22. Design system tooltip and technical vocabulary in the panel

**Decision:** the app has its own tooltip in the design system style and does not use the native `title`.
Text cut by an ellipsis always shows its full content, detected automatically; `data-tip` and
`data-tip-full` cover the rest. Git terms follow the author's VS Code: Staged Changes, Changes,
Submodules, and the verbs Pull and Push for commits still to bring or send (the first version used
Incoming and Outgoing, which the author does not recognize). The idea of a "submodule pointer" was
dropped: a submodule only shows up when it has changes, or commits ahead or behind in its own repository.
**Reason:** a request from the author on 2026-11-11 after seeing colloquial, confusing labels and the
native tooltip (outside the design system). **How to revert:** change the labels in `panel/git-section.ts`; the
tooltip is a single module.

## D23. Languages from the start: text catalogs

**Decision:** the app has more than one language (Portuguese and English first). All interface text
goes through a core translator, with typed catalogs: the Portuguese catalog defines the keys and the
type forces English to have all of them. There is plural and parameters, and relative dates and
durations become parts that the interface formats in the right language. The language comes from the
system; the user's choice lives in the settings screen.
**Reason:** doing it now avoids rewriting scattered text later; the panel was born translated and the
rest of the interface migrated in a single task.
**How to revert:** keep only the `pt-BR` catalog; the translator depends on nothing else.

## D24. Agents without coupling to Claude

**Decision:** nothing above the adapter knows that Claude exists. The core has a neutral agent session
model (name, model, tokens in context, window, estimated cost, last response, title and a list of
details with an identifier), with every field optional, and a profile per agent (id, name and the
process names that identify it). A tab's activity went from `'claude'` to `'agent'` with the profile
attached, and texts use the agent's name. Each agent is an adapter (`adapters/agent-claude`) that
implements `AgentSource`; supporting another agent means writing another adapter and registering it in
`main.ts`.
**Claude data source:** Claude Code records each live process in `~/.claude/sessions/<pid>.json`
(sessionId, directory, `procStart`, state). The adapter uses the PID of the tab's foreground process,
checks `procStart` against the `/proc` `starttime` (against a reused PID) and reads only the tail of
`~/.claude/projects/<directory>/<sessionId>.jsonl`: tokens in context, model, last response, title and
permission mode, never the content. With no record, no data: there is no more guessing by the most
recent file, which showed the wrong session when two sessions ran in the same directory. The record also
carries `status` (`busy` or `idle`), a not yet used signal that the agent is responding.
**Enrichment through `statusLine`:** brings the model window, the context percentage, the estimated
cost (client-side calculation at list price) and, for subscribers, the 5-hour and weekly limits with the
renewal time. It enters through `dck agent report`, with `DCK_PTY_ID` in each terminal tying the data to
the tab. Installing into `settings.json` is explicit, shows the change first, keeps a copy and chains the
`statusLine` the user already has; `dck agent uninstall` undoes it. Limits belong to the account, so they
apply to all tabs of the same agent.
**How to revert:** keep only the Claude adapter; the neutral model depends on nothing else.

## D25. Versioned daemon, replaced when it falls behind

**Decision:** the daemon runs separately from the shell and survives updates, so an old daemon silently
refused new methods (`agent.report` from the `statusLine` hit this). Now the daemon reports its protocol
(`info`) and accepts `shutdown`; on connecting, the shell compares it with its `DAEMON_PROTOCOL` and, if
older, shuts down the old one (`shutdown`, or by force through our own `daemon.cjs` on the same endpoint
when it does not even know the method), starts a new one and reconnects, with at most two attempts.
Whoever changes or adds a daemon method bumps `DAEMON_PROTOCOL`. Claude's `statusLine` also reports the
`transcript_path`, which says which session is on screen (including an attached background agent) and
outranks the process record; only paths inside `~/.claude/projects` are accepted. Failures of
`dck agent report` go to `~/.local/state/dck/agent-report.log`, never to Claude's screen.
**Reason:** the author reported that the panel kept showing no data after installing the `statusLine`.

## D26. Agent out of the product, code kept ready

**Decision:** on 2026-11-11 the author ordered the Agent section removed from the panel completely. Out
of the product went: the section, the `agent.inspect` channel (HostApi, preload, bridge) and all the
wiring in the shell's `main.ts` (sources, inspector and report guard). With no agent profiles, `claude`
in the foreground shows up again as an ordinary command in Sessions.
**Kept dormant and tested, to return later:** the neutral model and merging in the core
(`ports/agent.ts`, `agent/*`, `agent.*` texts), the `adapters/agent-claude` adapter (transcript, per-PID
record, statusLine normalizer, install planning), `shell/src/agent-inspector.ts` and `agent-reports.ts`,
the daemon's `agent.report` method and the `dck agent report|install|uninstall` commands. `DCK_PTY_ID`
stays in each terminal. The "Agent" category of the hold menu (Start Claude, Resume conversation) stays,
since it only types commands.
**To reactivate:** create the panel section that reads an `AgentSession`, reopen the `agent.inspect`
channel, instantiate `createClaudeSource`, `createAgentInspector` and `createAgentReports` in `main.ts`,
pass `onAgentReport` to `startDaemonLink` and `agents` (profiles) to the session inspector. The open
point is the attached background agent.
**Attention:** a `statusLine` already installed in a user's `settings.json` keeps calling
`dck agent report`, which is harmless without the shell listening; `dck agent uninstall` removes it.
**Replaced by D37** (2026-11-12): the dormant code was removed instead of reactivated.

## D27. System settings

**Decision:** a settings screen as an overlay inside the window (`Ctrl+,`), with no separate window, over
a `settings.json` in the app's data directory that the host validates with zod and writes atomically.
The screen and the file are the same source; the file may be edited by hand. An invalid field goes back
to its default by itself, without bringing down the others. `DCK_*` variables remain and win over the
file.
**First version scope:** language (automatic, Portuguese, English), appearance (light, dark or system
theme, opacity, font), window (anchored height, panel open at full height), global shortcuts (window key
and hold menu trigger) and projects and system (root folder, scan depth, start with the system, long
command notification threshold).
**Out of this round:** remapping the other shortcuts (the screen only lists them; done in D69), Jira and
GitLab connections and choosing what the panel shows.
**Everything applies immediately**, including the language (live translator in the core:
`createLiveTranslator`) and the projects folder. Texts built at startup are getters or are rebuilt when
the language changes.
**Principles:** everything has a default and "restore defaults"; secrets only in the secret store, never
in the file; nothing mandatory to use.

## D28. Project standards verified by tests

**Decision:** on 2026-11-11 milestone 2 started by returning a bare `ErrorCode` in `Result` (secret store,
HTTP and GitLab), when the existing code returns `ErrorBody` (`fail(errorBody(code, detail))`). The deviation
was only found when the author asked. The standard was written into `AGENTS.md` based on the code, and the
rules that can be measured became `packages/core/src/conventions.test.ts`: a `Result` failure is an
`ErrorBody`, `fail` always with `errorBody`, no empty `catch`, `core` importing neither packages nor
`node:`, adapters not importing adapters, test titles starting with `should`.
**Reason:** prose instructions do not prevent repetition; what can be checked mechanically runs in
`pnpm test`. The process also says to open a neighboring file before writing new code.
**Open:** 19 old test titles do not follow `should ... when ...` (they use another conjunction). The test
only requires the `should` prefix until someone decides between renaming the 19 or loosening the rule.
**How to revert:** delete the test; `AGENTS.md` remains as a guide.

## D29. Settings in internal tabs, list on the left

**Decision:** the settings screen (D27) gets a vertical list of sections on the left and the section's
content on the right: General (language, appearance, window), Shortcuts (the editable key and the
reference), Projects, Connections (GitLab, later Jira) and System; the harness gets its own tab when it
arrives. It always opens on General, without remembering the last tab. "Restore all defaults" sits at the
end of the System tab, as a discreet link with confirmation, and does not touch connections (restoring
preferences does not disconnect an account).
**Reason:** the anchored window has half the height and plenty of width, so a list on the left saves
height and grows with Jira and the harness without crowding, unlike tabs on top. Each section fits without
scrolling the whole screen, and only the right pane scrolls.
**Accessibility:** a vertical `tablist` with `tab` and `tabpanel`, a single tab in the Tab order, arrows,
Home and End move and activate, initial focus goes to the selected tab. Selection follows the design
system, like the terminal tabs: `--tab-active` fill and text color, with no bar, bold or underline (the
first version invented its own style and was corrected). The same rule applies to the MR views. Visible
focus by outline, everything through tokens.
**How to revert:** go back to `body.replaceChildren` with all groups in sequence.

## D30. Window shortcut as a GNOME custom shortcut

**Decision:** on packaged GNOME, the key that opens and closes the window is registered as a system custom
shortcut (`gsettings`, `media-keys/custom-keybindings`) calling `dck toggle`, in place of Electron's
`globalShortcut`. Outside GNOME or in dev mode, `globalShortcut` remains. If `gsettings` fails or another
custom shortcut uses the same key, the change is refused by the `veto`, as before.
**Reason:** Electron's single registration at boot races the session (autostart starts before
`gnome-settings-daemon` and the rest settle), and a refusal is never retried: after a restart the shortcut
disappears until the key is changed. `gnome-settings-daemon` restores the custom shortcut at every login,
which solved the same problem for Guake.
**Cost:** `dck toggle` measures 60 to 70 ms, within the 100 ms budget but with no slack; recheck if the
budget tightens. The shortcut stays in the system even with the app closed (in that case the toggle says
there is no window). A conflict with a native GNOME key (not a custom one) is not detected.
**How to revert:** delete the adapter and go back to only `createElectronShortcuts`.
**Update: `dck toggle` loads only the socket code (2026-11-19).** The toggle had grown to about 100 ms
on the CLI alone, half of it Electron starting as Node and half reading one 990 kB `dck.mjs` that held the
daemon, the extensions, jsonc, the settings schema, both catalogs and all of zod, and read `settings.json`
before any command. Now `main.ts` runs `toggle` and `ping` with only the socket, the IPC protocol and the
English error catalog, and loads the rest by `import()`: the settings and the user's translator only to
report a failure, `daemon-process.ts` for `dck daemon` and `full-cli.ts` for every other command. The
protocol validates with `zod/mini` (the classic zod build alone costs about 25 ms to load there) and
`@dck/core` declares `"sideEffects": false`, so the bundler leaves out the modules of the barrel the
toggle does not use. `buildCli` makes two builds: `resources/dck.mjs` (87 kB) and, from what it imports
lazily, `resources/cli/` (`full-cli.mjs`, `daemon-process.mjs` and a shared 856 kB chunk); a single split
build would put zod's shared modules, its classic API included, in a chunk the toggle also loads. With
Electron as Node at 48 ms on an empty module, the CLI alone went from 101 to 58 ms median (118 to 71 ms
p95) and `ping` from 100 to 56 ms, over 40 runs; through the window (`scripts/perf`, request to the first
frame drawn visible, 32 runs) from 127 to 60 ms median and 164 to 74 ms p95, in a container without a GPU.
`dck agent signal`, which coding agents' hooks run on every event, now loads the same way, with its schema
also in `zod/mini` (the hub answers `DCK-IPC-003` when either zod build rejects the params): from 110 to
63 ms median (149 to 85 ms p95) against a daemon over 40 runs, and from 106 to 57 ms outside a cockpit
terminal.
The other commands take as long as before. To revert, go back to one `build` of `main.ts` with `outfile`.

## D31. A single pattern for the floating tabs

**Decision:** Settings, MRs and project search use the same anatomy (header with X, content, optional
hint footer) and a single key style, in `ui/src/kit/panel-frame.ts`. An action shortcut goes in the button's
tooltip, never inside it. The footer does not list `Esc`. An MR with a passing pipeline shows no chip.
**Reason:** each tab had its own `kbd` and footer, the MR screen repeated the same shortcut in two places
and only Settings had a mouse exit.
**How to revert:** go back to the `.vk`, `.vhint` and `#search-hint kbd` styles and remove the X from the
two tabs.

## D32. Fewer letters in the shortcuts

**Decision:** project search goes from `Ctrl+Shift+O` to `Ctrl+Shift+P` (P for project). `Ctrl+Shift+J`
(next finished) loses its shortcut: the tab that finished is already marked in the bar and in the tab
list, and the action remains in the hold menu. Inside the screens only `Ctrl+letter`: Pending in MRs goes
from `Alt+P` to `Ctrl+P`. No command palette.
**Reason:** too many letters unrelated to the action name are hard to memorize. What remains are the GNOME
terminal conventions (`Ctrl+Shift+T/W/C/V`, `Ctrl+Tab`, `Alt+1..9`) plus a few mnemonic letters.
**How to revert:** restore `o` and `j` in `platform/shortcuts.ts` and `Alt+P` in `views/views-view.ts`.

## D33. Open source: license, language and contribution

**Decision:** the project is published under AGPL-3.0-only, with contributions accepted under the
Developer Certificate of Origin (`Signed-off-by` on each commit, no CLA). Everything that is not text
seen by the end user is in English: code, comments, logs, error details, documentation, plans, issues,
pull requests and commits; Portuguese exists only as a translation of the interface (`i18n/pt-BR.ts`). A
test (`project language` in `conventions.test.ts`) keeps comments in English. Releases are automated from
Conventional Commits. The maintainer's personal planning notes stay out of the repository.
**Reason:** the copyleft requires anyone who redistributes a modified version to publish it under the same
license and keep the authorship; the DCO is the lightest way to take contributions, at the cost that the
license cannot be changed later without every contributor's consent.
**How to revert:** not reversible for versions already published; a new license can only apply to future
versions and only with the consent of all copyright holders.

## D34. Error messages live in the i18n catalogs

**Decision:** `error-codes.json` no longer carries a message. The text of each code is the catalog entry
`error.<code>`, in English (`en.ts`) and Portuguese (`pt-BR.ts`). Logs and RPC messages use the English
entry; the CLI prints the entry in the user's language. Connection errors keep their own, more helpful
`connections.error.*` entries. A test requires every registered code to have an entry in every catalog.
**Reason:** the registry's Portuguese messages broke the rule that code and logs are in English, and a
message shown to a user belongs in the translation catalog, not in a code registry.
**How to revert:** put a `message` field back in `error-codes.json` and read it in `errors.ts`.

## D35. Extensions: standards first, code in a dedicated host later

**Decision:** the product becomes extensible in small, ordered steps (`plans/extensions.md`). First a small
foundation (a manifest, contribution points, the sources an extension can come from and the extensions folder,
with no code loading), so everything after is born as a contribution of the same mechanism. Then the AI agent
harness: standards written as Markdown files with a validated front matter, rendered into agent instructions
(`dck render`) and checked automatically (`dck check`), with built-in examples that are all off. Then
**packs**, the first installable extension kind (a folder with a `dck-extension.json` manifest and standards,
no code). Extensions with code come later and run in **a dedicated extension host process with a JavaScript API**
(the VS Code model), separate from the window and the daemon, talking to the product over JSON-RPC.
Connectors (GitLab, Jira) will use that same API, and the contract is extracted from the first two real ones,
as D5 requires. Standards come from four sources with this precedence: repository, the user's global folder,
installed packs, built-in. A higher source replaces the fields it declares, and the `check` list and the body
as a whole.
**Reason:** not everyone uses GitLab or Jira, and everyone works with AI agents differently. A standard is
data, so it can be shared safely first; code is added only once the data model proved itself. A dedicated
host keeps the cockpit alive when an extension fails and gives authors an editor-like experience.
**Accepted cost:** extension code in the host runs with the user's rights, so permissions are a declaration the
user approves and the host API honors, not a sandbox. The rule language stays small (four rule kinds) so it
does not become a programming language.
**How to revert:** the harness and packs contain no code loading, so they can be removed without touching the
rest; the host contract is defined in phase 3 and is not frozen before it.

## D36. The harness leaves the product before its first release

**Decision:** the AI agent harness (phase 1 of `plans/extensions.md`) and the standards packs (phase 1b)
leave the product. The Harness was built and merged (rules as files in `.dck/rules/`, a settings page,
marks in the Git section, `dck init`, `dck rules`, `dck guide`, `dck check`) and removed before any release.
This drops the harness part of D35 and the per-agent standards generation of D8; the extension foundation
of D35 (manifest, sources, `dck ext list`) stays, with no contribution point registered yet.
**Reason:** reviewed with the maintainer after using it: it is configuration a developer sets once, not
something used during the day; branch and commit conventions are already solved by a commit tool in one
line of config; using it took too many concepts (rule, check, field, source, precedence, a marked block,
a `CLAUDE.md` import); it wrote files into the team's repository, which a developer must first get the
team to accept; and its marks pointed at commits that can only be fixed by rewriting history. The cockpit
earns its place in what is open all day: tasks and reviews from Jira and GitLab, several agents at once,
reviewing what an agent changed, and getting back to a project's context.
**How to revert:** revert the commit that removed it; the code, its tests, its docs and the two reviews
are in the history of pull request #12.

## D37. Agent attention through the agent's own hooks and a neutral signal

**Decision:** the cockpit tells which tab needs the user, not how many tokens an agent spent. It knows
four neutral states per tab (working, needs you, your turn, ended) and one command, `dck agent signal
<state>`, which reads `DCK_PTY_ID`, goes through the daemon's `agent.signal` method and reaches the
window, where the attention tracker marks the tab: needs you with a warning diamond and a notification
whatever the duration, your turn with the existing finished rules. A working tab whose terminal stays
quiet for 5 s becomes your turn, because Esc fires no hook. Each agent is wired with its own public
mechanism calling that command (Claude Code: a plugin with its hooks, in `integrations/claude-code/`);
nothing in `core`, the shell or the UI knows which agent sent a signal. The command never fails, prints
nothing and does not read stdin, so a hook is harmless outside the cockpit.
**Replaces D26's dormant metrics path:** the `agent-claude` adapter (transcript, process record,
`statusLine` normalizer, install planning), the agent inspector and reports in the shell,
`dck agent report|install|uninstall`, the `agent.report` daemon method and the neutral session, report,
limit and detail models were deleted. `AgentProfile` and the `agent` activity stay for the session
inspector.
**Reason:** Claude Code's internal files changed between versions and mapped to the wrong session when
two ran in one directory; installing the `statusLine` edited the user's settings; the metrics were already
in the agent's own status line in the same terminal and asked for no action, while a blocked agent does.
**How to revert:** the removed code is in the history before this decision; the signal path stands
alone and can be removed without touching the tabs.

## D38. Design system select in place of the native one

**Decision:** every choice from a closed list uses the kit's select (`ui/src/kit/select.ts`), never a native
`<select>`. It is a button with the WAI-ARIA select-only combobox pattern: the focus stays on the button,
the list follows it with `aria-activedescendant`, and it opens under the button (above when there is no
room). The closed control has the shape of the text inputs; the list has the look of the other popup
lists: `--surface` card, `--list-selected` on the active option and a check on the selected one. Escape
closes only the list, Tab and a click outside close it without changing the value.
**Reason:** the native popup is drawn by the system, outside the tokens, the fonts and the dark theme,
and did not match the settings rows. A request from the maintainer on 2026-11-13.
**How to revert:** give the settings view's `select` helper back its `<select>` and delete the kit module
and `styles/select.css`.

## D39. The agent profile says how to connect it, and the cockpit suggests it

**Decision:** an agent's marks only appear once its integration is installed, so the cockpit now tells
the user. `AgentProfile` gains an optional `connect` with two texts: one for a shell prompt and one for
the agent's own prompt while it runs. The profiles are data in the shell (`inspectors/agent-profiles.ts`),
passed to the session inspector and to the window; core and the interface know only that a profile may
connect. A tab whose agent sent no signal in its first 10 s shows a hint in Sessions; Connect, there or in
the hold menu, types the text without Enter, so the user reads it and confirms. "Not now" turns the hint
off in `system.agentConnectHint`. The Claude Code plugin signals `your-turn` on `SessionStart` (startup and
resume, not `compact`, which can happen in the middle of a turn) so a connected session never shows it.
**Reverts part of D26:** with profiles passed again, `claude` in the foreground is shown as Claude Code
running, not as an ordinary command.
**Reason:** "it is not clear how a dck user will know how to use what we built", from the maintainer on
2026-11-13.
**How to revert:** drop `connect` from the profile and the hint from Sessions; the marks do not depend on
them.

## D40. Paths in the terminal open with Ctrl+click, and nothing they point at is run

**Decision:** a file or folder path printed in a terminal (absolute, `~/`, or relative with a slash or an
extension, with an optional `:line[:col]`, also inside quotes and parentheses, never inside an address)
becomes a link only when it exists. The window finds the candidates with an xterm link provider when a line
is hovered and asks the host once per line through `paths.resolve` (at most 50 paths of at most 1024
characters, the tab's directory as the base, `~` expanded by the host, answers cached for 2 s). Ctrl+click
(Cmd on macOS) on a file opens it with the default app through `paths.openFile`; on a folder it opens the
tab menu with "Open in a new tab" and "Open in the file manager" (`paths.openFolder`). The host re-checks the
real file before opening: a file with any execute bit, or whose name or link target ends in a launcher or
installer extension (`.desktop`, `.sh`, `.AppImage`, `.exe`, `.app` and the rest in
`shell/src/electron/terminal-paths.ts`), is only shown in its folder (`showItemInFolder`). A refused request
is logged by kind, never by path.
**Reason:** a request from the maintainer on 2026-11-13; terminal output is not trusted, and the default
app of a launcher or a script runs it.
**How to revert:** drop `attachPaths` from the terminal session and the `paths` channels from the bridge.
**Amended by D84** (2026-11-19): a file Ctrl+clicked opens in the cockpit over its tab, at the line and
column the output names; Ctrl+Shift+click, or `files.openPathsInCockpit` off, opens it in the default app as
above, through the same checks. A folder and an address are unchanged.

## D41. GitLab becomes a built-in connector, and the product speaks of connectors by id

**Decision:** a connector is a contribution of the extension system (`connectors`, the first registered
point, `plans/connectors.md`). It declares its id, its name, the fields of its connection (address, an
optional account e-mail, a token with its hint) and its views (id, title, item kind `mergeRequest` or
`issue`, and which one feeds the rail badge). GitLab ships as the built-in extension `dck.gitlab`; Jira
arrives as `dck.jira` only with its code, so no extension is declared without an implementation. Only
built-in extensions may declare a connector until the extension host exists (D35): one from another source
is refused with `DCK-EXT-002`. The window and the daemon find a connector's code by its id; an enabled
connector with no code is logged and left out. Everything outside a connector's own files is per id:
`connections.<id>` in the settings (GitLab's `connections.gitlab.url` keeps its path and meaning), the
keyring key `<id>.token` with the profile prefix (`gitlab.token` and `dev:gitlab.token` are unchanged),
the host channels `connections:list|status|connect|disconnect` and `views:*` by view id, one views service
and one cache file per connector in the daemon (GitLab keeps `views-cache.json`, and a cache written before
reads as merge requests), view items as a union by `kind`, and daemon protocol 5. The Connections page
draws one section per enabled connector from its declaration, and the Work screen shows only the tabs of
connected accounts, with the "Account not connected" notice and an "Open Connections" button when there is
none. `dck ext enable` and `dck ext disable` manage `extensions.disabled`; the window watches the settings
file and applies that list at once (since D65, with every other field of the file), and a disabled
connector keeps its address and token. Connections lists
the disabled built-in connectors with an Enable button; disabling stays in the CLI. A connector or view id
already used by an extension loaded before refuses the later one.
**Reason:** not every company uses GitLab, and Jira is next (D5): two real connectors before an external
contract. Keeping the contract internal and the code built in avoids designing the host before it is needed.
**Accepted cost:** the CLI now writes `settings.json` (only `extensions.disabled`, keeping the rest of the
text as written since D65);
a request for an id that is not an enabled connector is refused with `DCK-IPC-003` instead of GitLab's
address error.
**How to revert:** revert the commits of phase A; the settings file and the keyring key did not change, so
an existing setup keeps working on either side.

## D42. macOS: a panel window, F12 on every platform and the Keychain through `security -i`

**Decision:** the MAC-T1 spike settles the macOS design of [plans/macos.md](../plans/macos.md). The window is
an Electron `type: 'panel'` at the `screen-saver` level, visible on all workspaces and over fullscreen, with
no Dock icon, focused on show with `focus()` and `app.focus({ steal: true })`. The default key stays `F12` on
every platform, so there is no per-platform default; on a Mac keyboard it is `fn+F12`. The Keychain is
reached through `security -i` with the command on stdin, and a value with a line break is refused, since
`security` has no escape for it. Process inspection uses `ps` (`tpgid`, `ucomm`) and `lsof -a -d cwd -Fn`.
Tested on macOS 26.5.1 arm64 with Electron 45.3.0: the panel showed over a fullscreen app and on another
desktop and received the keyboard without a click; F12, `Ctrl+Backtick` and `Option+Space` fired with no
Accessibility permission; `node-pty` opened `zsh -il`; `lsof` took about 20 ms.
**Reason:** the spike on a tester's Mac on 2026-11-13; F12 keeps one key across platforms and was the
tester's choice.
**How to revert:** the plan B of the plan's risks (a regular high-level window with the Dock hidden), or a
per-platform default key passed in by the host.

## D43. Work tabs are named by the action they ask for and grouped by service

**Decision:** the GitLab tabs become "To review" (`review`) and "Follow up" (`mine`); Jira keeps "Tasks". The
Work header draws each connected connector's tabs after a group label with the connector's `name`, in the
connectors' order, even when only one service is connected, with a thin `--line` divider between groups.
The label is a muted uppercase caption like the panel's section heads, not a control. A view declares a
`description` catalog key next to its title, shown as the tab's tooltip. The tablist still owns only tabs,
so ←→ crosses the groups: the label is `aria-hidden`, and each tab's name carries the service
("GitLab, To review, 6") with the description in `aria-description`.
**Reason:** testing with a real Jira, the maintainer found "Assigned" and "Created" unclear and nothing said
which service a list came from (2026-11-13).
**How to revert:** restore the two catalog entries and draw the tabs without the group labels; the
`description` key can stay in the declarations.

## D44. The Tasks list is grouped by progress, filtered by project, and the Work lists search by word start

**Decision:** the Tasks tab shows "In progress" and then "To do", each with its count and in the list's order
(most recently updated first); an empty section is hidden and filtering keeps the sections. A section is a
`role=group` labelled "In progress, 6" inside the listbox, its visible header is `aria-hidden`, and the
rows' `aria-posinset` and `aria-setsize` count only tasks. ↑↓ and, with an empty filter, Home and End move
over tasks only. Right after the filter, the kit's select (D38) named "Project" chooses one project: "All
projects" with the total first, then every project of the list with its count beside it, most frequent first
and then by key. It is as wide as its longest option, shows "All projects" or the chosen key when closed,
gives the focus back to the filter after a pick, is hidden on a list with one project and resets when the
screen closes. Toggles were tried first and dropped: with six or more projects they wrapped to a second line
and a seventh was out of reach. Both Work lists (merge requests and tasks) search with `searchViewItems` in
`core`: every typed word must start a word of the item, ignoring case and accents; the exact key or
reference comes first, then the keys that start with the query, and a typed key selects its task even in a
later section. The fuzzy search of the tabs and projects is unchanged.
**Reason:** testing with a real Jira (45 tasks across projects), the maintainer found the flat list hard to
scan and the fuzzy search too loose ("bug" matched "build") (2026-11-13).
**How to revert:** draw the Tasks list as one group, drop the project select and call `searchItems` again in
`filterViewItems`.

## D45. The empty scrollbar strip never reads as a wider right margin

**Decision:** a scrolling list keeps its rows evenly placed between the card's edges. A list with inner
padding (the select, All tabs, the project search) is watched by `watchOverflow` in `kit/scrollbar.ts`, a
`ResizeObserver` and a `MutationObserver` that set `data-overflow`; while it overflows, the 8px strip takes
the place of the right padding and the left padding grows to 8px. A list whose rows run edge to edge (the
Work list, Settings, the side panel) carries `scroll-edges`, `scrollbar-gutter: stable both-edges`, and
gives the 8px back from its inner padding, so its text stays where it was and nothing shifts when the
list starts to overflow. The Work rows become rounded bands with a 1px gap, like the other lists, and the
select and All tabs show ten whole rows before they scroll.
**Reason:** the maintainer saw the highlighted option 4px from the left border and 12px from the right one
once the project select scrolled, and the same strip in the other lists (2026-11-13).
**How to revert:** drop the `data-overflow` rule and `scroll-edges` from `styles/terminal.css` and the
padding changes that came with them.

## D46. The secret store is chosen in `@dck/daemon`, for the window and the daemon alike

**Decision:** `systemSecretStore(platform)` in `@dck/daemon/secret-store` picks the Keychain on macOS and
`secret-tool` elsewhere. The daemon's entry point and `dck daemon` build it once and pass it to every
connector's views; the shell's `selectPlatform` calls the same function instead of choosing on its own.
**Reason:** the window writes the token and the daemon reads it, so both processes must pick the same store;
one chooser that both import cannot drift, while two copies of the choice could. It does not live in
`core` because the choice has to import the Keychain and `secret-tool` adapters, and `core` imports no
adapter.
**Accepted cost:** the shell now depends on `@dck/daemon`, and only through its `secret-store` subpath, so
the window does not load the daemon's server or views.
**How to revert:** move the choice back into `selectPlatform` and into each daemon entry point.

## D47. A tab splits into panes, and the review of what changed is the second one

**Decision:** a tab holds one or two panes side by side (`core/src/panes/panes.ts`): its terminal first and,
for now, the review as the second, with the share of the first pane and which pane has the keys. The
divider is a 1px line with a 9px grip, a `role=separator` that resizes with the mouse and with ←→ (16px),
Home and End, and announces the review's share. Each pane keeps a minimum width (terminal 360px, review
440px); below both, the focused pane takes the whole tab and Esc or the header's terminal button goes back.
While the terminal shows, the tab carries a quiet split glyph in the bar ("Review open", with Ctrl+Shift+D in
its tooltip and in the tab's accessible name), a mark that never counts as attention. The divider shows a
2px muted line under the mouse and while dragging, and the foreground only on keyboard focus.
A second terminal pane is a new kind in the same model, not a new layout. Ctrl+Shift+D (reserved in D13)
opens the review on the active tab and focuses it, and closes it while it is on screen; in a narrow tab
showing the terminal it brings the review back instead. The same action is in the tab's right click menu
and in the hold menu's Tabs. Esc gives the keys back to the terminal without closing the review.
The review follows the tab's folder (a fresh read of the session's directory) and finds the repository
with `git rev-parse`. A select (D38) picks Uncommitted (the working tree against HEAD, untracked files
that `.gitignore` does not hide as additions) or "Branch vs main" (the working tree against the merge base
with `origin/HEAD`'s branch, else `main`, else `master`). The adapter runs git with fixed arguments, no
shell, `--no-color --no-ext-diff -M`, a timeout and a 32 MB cap; untracked files go through
`diff --no-index` one by one, so the index is never written. The bridge validates the folder with zod and
checks it exists before it reaches git, and reads file text only from a root a diff returned. Errors are
the new `GIT` domain. The unified diff is parsed in `core`; the view draws it the way GitHub and GitLab do,
with no syntax colors: old and new numbers, + and − signs (state is not told by color alone), added and
removed lines on the new `diffAdd` and `diffRemove` tints, the changed words on a stronger tint found with
jsdiff's `diffWordsWithSpace` (only the paired lines of a hunk, skipped when a line shares less than 35%),
hunk headers with Git's function context, and the unchanged stretches as "Show N lines" rows that open
from the working tree file. Lines are virtualized (20px rows, 26px hunk headers), so a 10 000-line diff
keeps about 50 rows in the page. Binary, non-UTF-8, renamed, copied, mode changes, submodules and CRLF files
are labelled for what they are; generated files (lock files, `dist/`, minified, `linguist-generated`) and
files over 2500 changed lines start collapsed with "Show anyway"; an untracked file over 1 MB shows its size
only. Keys inside the review: ↑↓ and Enter in the file list, ↑↓ PgUp PgDn Home End and Enter in the diff,
`[` and `]` for the previous and next file and `n` and `p` for the next and previous hunk (Gerrit's keys;
they only act inside the review, which has no text field), Ctrl+R to read again. Ctrl+click on the file's
path opens it (D40). The diff is read on open, on Ctrl+R, after a scope or whitespace change and when the
tab's agent changes state (debounced 400 ms), and never while the review is closed.
**Reason:** the agent says "your turn" (D37) and the developer reads what it changed beside the terminal,
in the same tab; a request from the maintainer on 2026-11-13 (`plans/review.md`).
**How to revert:** drop `createReviewTabs` and `createTabView` from `app.ts`, the `review` channels from
the bridge and the preload, and the `review/` and `panes/` folders; the terminal goes back to filling the tab.
**Update: untracked files are read in process (2026-11-18).** One `diff --no-index` per untracked file cost
over 5 s for 300 files on a Mac, so the adapter builds the addition from the file's bytes as git shows it
(`untracked-file.ts`: NUL in the first 8000 bytes is binary, a link shows its target), with one
`check-attr` and one `config` per repository. A file git would transform first still goes through
`diff --no-index`: a diff driver, a clean filter, `ident`, a working tree encoding, or a carriage return
when `text`, `eol`, `crlf` or `core.autocrlf` may convert line ends. A test compares both readers on every
kind of file. To revert, send every file to `diffUntracked`.
**Update: the review slides in and out (2026-11-19).** Opening the review (its key, the tab's menu, the hold
menu, the panel's review button) grows its pane from nothing to its share while the terminal gives way,
beside or below as the tab lays them out, and closing it does the reverse, with the side panel's motion
(`--motion-normal`, `--motion-easing`, a `flex-basis` transition under `data-moving` in `styles/panes.css`,
`slide` in `panes/tab-view.ts`); in a narrow tab, where the review takes the whole tab, it slides over the
terminal the same way. The terminal keeps its grid meanwhile (`isMoving` holds its fit as D67's drag does)
and fits once when the motion ends; the divider sits between the panes all along, and the focus, the pane's
removal on close and the final layout come after the motion; a layout asked meanwhile (a focus change in a
narrow tab, a resize) waits for its end. A second open or close finishes the one under way at once, and a
transition that never reports its end is ended 200 ms after its length. With
`prefers-reduced-motion: reduce` nothing moves. Measured under Xvfb with a review of 1000 changed files
(the index and the diff virtualized), side by side and narrow, both themes, three opens and three closes
each: 43 or 44 frames in 700 ms, no long task, and one frame over 20 ms (33 ms, a first open) in 24
motions. To revert, drop `slide`, `isMoving` and the `animate` and `onMoved` options, and
the `data-moving` rules.

## D48. The review fits the tab's shape, reads as one scroll and compares with where the branch started

**Decision:** the split chooses its orientation from the tab's size and each pane's real text grid
(`chooseOrientation` in `core/src/panes/panes.ts`): side by side when the terminal and the review each keep
about 100 columns (the terminal's measured cell, the diff's 12px cell and gutters), stacked with the
terminal on top when each keeps 15 rows, else the focused pane alone as in D47. The setting `review.layout`
(Automatic, Side by side, Stacked) has a row in Settings; a chosen orientation holds while it fits its
minimums. Each orientation keeps its own divider share in settings (`review.sideRatio`,
`review.stackedRatio`, clamped), saved 400 ms after the divider rests and only when the panes really moved.
The stacked divider is a horizontal `separator` that resizes with ↑↓. A header button names the orientation
it switches to and Ctrl+Shift+E does the same: free in D13 and in Claude Code, and the split key of
Terminator and Guake. Ctrl+Shift+D now gives the keys to an open review from the terminal and closes it
only from the review; a closed review keeps its place in the diff until its tab closes.
Every file reads in one virtualized scroll (`changeRows` in `core/src/diff/change-rows.ts`): a 40px header
row per file (8px of air and a 32px band with state, path, labels and counts), the header of the file being
read pinned on top, a generated, large or binary file as its header alone with "Show anyway". Each file's
rows sit in a `group` named after the file inside the diff's `listbox`, the header row being an option the
cursor lands on, so `]` and `[` never leave the keys on the page. `n` and `p` cross files both ways. The file
list is an index beside the diff from 720px of review width (above it when narrower), collapsible for the
session, following the file at the top. The gutter, the hunk and gap rows and the headers stay in view on a
sideways scroll. The hint bar shows the review's keys only while it has the focus, else Ctrl+Shift+D.
The Branch scope compares with where the branch started, like VS Code: `branch.<name>.vscode-merge-base`,
else the branch's creation in its reflog (and the HEAD reflog for "Created from HEAD"), else the branch HEAD
is fewest commits ahead of, the latest merge base breaking a tie, among the 30 most recently committed
local and `origin/` branches (local before `origin/`), never the current branch, its remote copy, its
upstream or one that already contains HEAD. No branch name is special, since every team names its own
(a conventions test keeps names out of the code); on the remote's default branch the nearest is not used.
The scope select always offers "Uncommitted", "Base: <name>" with how the base was found in its tooltip
and the other candidates to pick, and "Unpushed commits" against the upstream's merge base, the last two
disabled with their reason when there is no base or no upstream. The user's pick is kept per repository
folder in settings (`review.bases`); the bridge passes only a plain branch name.
**Reason:** at a usual window size side by side squeezed both panes, one file at a time broke the reading of
a change, and git flow branches start from develop, not from the remote default; the maintainer's
decisions and a usability test on 2026-11-13 (`plans/review.md`, phase 1b).
**How to revert:** set `review.layout` to `side` and drop `chooseOrientation` for `PANE_MIN_WIDTH`; draw one
file with `diffRows` again; drop `createBaseFinder` for the remote default.

## D49. The cockpit never guesses or imposes a convention that may not be the user's

**Decision:** when the cockpit must infer something it reads what the user's own tools already record
(Git config and reflog, VS Code, the remote, the connected services), always lets the user correct it, and
never requires a naming pattern for branches, folders or tickets. It is premise 6 in `AGENTS.md`. Two
changes come with it. The projects folder has no default: `projects.root` stays unset (`null`) until the
user picks a folder, and the project search then shows a calm empty state with one action, "Choose the
projects folder", which opens the system folder picker (`projects:choose-root`, an absolute path validated
by the host), saves the choice through the settings model and goes straight into the search; cancelling
leaves it unset, and the Settings row still changes it. The Git section's ticket chip shows only with Jira
connected and only for a key in Jira's own format whose project is the project of one of the user's Jira
tasks the window already holds for the Tasks view (read from the daemon's store when the window shows,
never fetched for this); the chip is a link to `<site>/browse/<KEY>`, opened in the browser through the
same check as the other connector links.
**Reason:** the maintainer found the cockpit assuming a `~/projetos` folder, a Portuguese name that is not
everyone's, and reading any `ABC-123` in a branch name as a ticket, a pattern many teams do not follow
(2026-11-14). A wrong guess is worse than no guess: it shows something false with the cockpit's authority.
**How to revert:** give `projects.root` a fallback folder again in `shell/src/main.ts`, drop the
`projects:choose-root` channel and the empty state, and call `ticketFromBranch` without the known projects.

## D50. On Linux the window renders without the GPU

**Decision:** on Linux the shell calls `app.disableHardwareAcceleration()` before the app is ready
(`usesGpu` in `shell/src/platform/select-platform.ts`), so Chromium composites the window in software and
its GPU process shrinks. The Mac keeps hardware acceleration until it is measured there.
**Reason:** the idle budget is 300 MB for the shell and the daemon, and a fresh cockpit measured 276 to 293
MB on the maintainer's Ubuntu machine (2026-11-16), with the GPU process at about 49 MB. With
`--disable-gpu` it measured 263 MB, the GPU process at 22 MB, and the transparency, the review's scrolling
and the toggle key behaved the same. The interface is text on the DOM, the terminal included (xterm's DOM
renderer, D14), with little to gain from the GPU. `--in-process-gpu` was measured too and saved
nothing: the main process grew by what the GPU process lost.
**How to revert:** make `usesGpu` return true for Linux.

## D51. On the Mac the cockpit's keys use Cmd where the Mac does, and Ctrl stays with the shell

**Decision:** Q3 of [plans/macos.md](../plans/macos.md). One keymap per keyboard (`ui/src/platform/keymap.ts`,
chosen by `keyboardFor(navigator.platform)`) both matches the keys and writes every label, so a tooltip, the
hold menu and the reference in Settings never disagree with the key. On a Mac: `⌘T` and `⌘W` open and close a
tab, `⌘1` to `⌘8` go to a tab and `⌘9` to the last one (D68), `⌃Tab` and `⌃⇧Tab` or `⇧⌘]` and `⇧⌘[` move
between tabs, `⌘,` opens Settings, `⌘=`, `⌘−` and `⌘0` change the font, the cockpit's own keys are `⇧⌘` and
the letter they have with `Ctrl+Shift` elsewhere (`⇧⌘D` the review, `⇧⌘P` the projects), the full height is
`⌃⌘F` (F11 shows the desktop on a Mac) and the keys inside a panel are `⌘D`, `⌘R`, `⌘P` and `⌘C`. Labels use
the Mac's symbols in its order (`⇧⌘D`). The app menu gains the system Edit menu, so `⌘C`, `⌘V`, `⌘X`, `⌘A` and
`⌘Z` work in fields and in the terminal, where `Ctrl+Shift+C` and `V` stay a PC key and Ctrl goes to the
shell; the left Option is Meta in the terminal (`⌥B`, `⌥F`) and the right one types characters (D68). A chord
with Alt reads the physical key, since Option changes the character (`⌥1` types `¡`); the global key recorder
does the same. MacBook keyboards have no right Control, so `shortcuts.holdTrigger` stays null until the user
picks a key and the keymap gives each keyboard its own: the right Command on a Mac (the right Option until
D68), the right Ctrl elsewhere; a key the user chose is kept. The keymap also gives the click modifier for
links and paths (`⌘` on a Mac). Since D69 these are the defaults: the user can give any action another
key, which the keymap reads, and every label follows it.
**Reason:** the maintainer's choice on 2026-11-16, before MAC-T7: Terminal.app and VS Code users expect Cmd,
and the shell needs Ctrl. Option as Meta took the accented letters away from the terminal; since D68 the
right Option types them.
**How to revert:** give the `mac` table in `keymap.ts` the `pc` chords, drop `{ role: 'editMenu' }` from
`buildAppMenu` and `macOptionIsMeta` from `terminal-session.ts`, and set `HOLD_TRIGGER.mac` to `ControlRight`.

## D52. Under native Wayland the compositor gives the window its size before it shows

**Decision:** in a Wayland session Electron runs as a Wayland client (`nativeWayland` in
`shell/src/platform/select-platform.ts`). Before each show the shell asks the compositor how large a window
opened now may be, through `xdg_toplevel.configure_bounds` (xdg-shell version 4), and the dock sizes the
window with that answer instead of the monitor under the pointer (`boundedScreen`). A small client in
`shell/src/platform/linux/wayland-bounds.ts` speaks the Wayland wire protocol over the session socket: it
binds the compositor and `xdg_wm_base`, creates a toplevel that never gets a buffer, so nothing is mapped,
reads the bounds that come before the first configure, and leaves. The compositor then puts the window on
the pointer's monitor, and it fits. Without an answer within 150 ms the window opens with the last size it
knew. X11 and XWayland keep the pointer and the work areas of D15.
**Reason:** native Wayland reads the pointer as 0,0 and ignores a requested position, so the window was
sized for the primary monitor and spilled onto the next one from a smaller laptop screen at 150% (the
maintainer's desk, 2026-11-16). XWayland placed it whole but never followed the pointer onto monitors
where only Wayland windows were. Guessing the monitor after showing, from the page's scale, made the
window open twice and flash, because Chromium learns the scale some frames later. Mutter and KWin answer
`configure_bounds` with the work area of the monitor the window would open on: on that desk 1920x1017,
1920x985 and 1280x737 for the three monitors, in 1 to 14 ms.
**How to revert:** drop `beforeShow` and `boundedScreen` from `shell/src/main.ts`; the window then opens
sized for the primary monitor under native Wayland.

## D53. With no catalog for the system language, the cockpit speaks English

**Decision:** when the language setting is automatic and no system language has a catalog, the window,
the tray and the `dck` command use English (`pickLocale` in `core/src/i18n/translator.ts`). The command
also follows the language chosen in the window's settings, and with the automatic setting reads the
terminal the way gettext does: the `LANGUAGE` list first, then `LC_ALL`, `LC_MESSAGES` and `LANG`, with
`LANGUAGE` ignored under the C locale (`environmentLanguages`). The `.deb` menu action is in English with
a Portuguese translation.
**Reason:** a German or French system opened the cockpit in Portuguese, the first impression for most
people who find the project, and `dck` answered in the terminal's language even when the window had
another one chosen.
**How to revert:** return `'pt-BR'` from the end of `pickLocale`.
## D54. The .deb runs on Ubuntu 22.04 and Debian 12, and says what glibc it needs

**Decision:** the `.deb` is built on a pinned runner (`ubuntu-24.04` for both processors), never on
`ubuntu-latest`. `package-deb.mjs` reads the newest glibc the packaged node-pty asks for and declares it
as `libc6 (>= x)` in `Depends`, and in CI it stops when that is newer than 2.35, the glibc of Ubuntu
22.04 (Debian 12 has 2.36). Electron itself needs 2.25.
**Reason:** node-pty is compiled on the build machine. Since `ubuntu-latest` moved to a newer image the
amd64 packages asked for glibc 2.42 (0.5.0 to 0.7.0): they installed on Ubuntu 24.04 and Debian 12 and
opened a window whose terminal never started. The arm64 runner was already pinned and asked for 2.34.
**How to revert:** drop the glibc block from `package-deb.mjs` and let the runners float.

## D55. The review follows the working tree, remembers what was viewed and names states by letter

**Decision:** while the review is open and the window shown, it asks every 2 s for a fingerprint of the
tab's repository (`git status --porcelain=v2` with HEAD, plus the size and modification time of each
changed path) and reads the diff again, quietly and in the same place, only when the fingerprint changed;
a check slower than 300 ms doubles the interval up to 16 s, and a closed review or a hidden window checks
nothing. Files can be marked viewed, as on GitHub (a checkbox in the header and `v`): a viewed file folds
to its header, the cursor moves to the next file not viewed, and the mark is tied to a key of the file's
change, so a later change clears it and the header says "Changed since last viewed". The marks live with the
tab, per scope and whitespace setting, and do not survive a restart. A file's state is a letter, as in VS
Code (M, A, D, R, C, U), in the ink of the counts, held to the text contrast minimum.
**Reason:** the agent keeps changing files while the developer reads, and a long change had no memory of
where the reading stopped (the maintainer, 2026-11-17). A file watcher was set aside: on a large repository
with `node_modules` it can run out of the system's inotify watches. Marks that survive a restart wait until
using the review shows they are missed.
**How to revert:** drop `fingerprint` from `DiffSource` and the watch from `review/review-refresh.ts` (the
review then reads on open, Ctrl+R and the agent's state, as in D47); drop `viewed` from `FileOpening`.

## D56. Review comments go to the agent as a Markdown file and one typed line, batched like a GitHub review

**Decision:** the review takes comments on lines of the change, as GitHub does: a click selects a line,
Shift+click or Shift+↑↓ stretches the selection inside the same hunk, and `c` or the gutter's "+" (with `c`
in its tooltip) opens a comment field under the last selected line (or the cursor's line). Lines opened from
a collapsed gap take no comment, as on GitHub. Ctrl+Enter saves (⌘Enter on the Mac), Esc cancels, an empty
comment cannot be saved; a saved comment stays pending as a card under its lines, with edit (Enter) and
delete (Delete) buttons, and its file's header counts it. "Send to agent" in the review header, with the
count, and Ctrl+Shift+Enter (⇧⌘Enter), from the review or the tab's terminal, write every pending comment to
a Markdown file and type one line at the tab's prompt, "Address the review comments in <path>" in the
interface language, with no Enter and no line break; the keys go to the terminal. They type only while an
agent runs in the tab (a known agent by its process, or any program that reports its state, as its marks
say), read fresh at the moment of sending; at a shell prompt or under another program the
button is disabled (`aria-disabled`, so its tooltip shows) with the reason, "No agent in this tab" or
"{process} is running in this tab",
the key shows it in the header and the comments stay; the button's state follows the tab watcher's reads
while the review is open. The file goes to
`<git dir>/dck/review-<YYYYMMDD-HHMMSS>.md` when the git folder is inside the repository (an agent reads it
without a permission prompt and git never lists it), else, in a linked worktree or a submodule, to the
system's temporary folder as `dck-review-<stamp>.md`; folder 0700, file 0600, written to a temporary name
and renamed, the newest 5 kept. The `ReviewNotes` port has its adapter in `node-git` and a host channel
that only takes a root a diff returned; a failure is `DCK-GIT-006`. The path typed is relative to the tab's
folder when the file is inside it, else absolute, quoted for a shell only when needed. The Markdown
(`core/src/diff/review-markdown.ts`) has a title, how many comments on how many files and which numbers
they use (the working tree's, the old file's for removed lines), a section per file by path and per comment
a heading with its lines and an outdated mark, a `diff` block quoting up to 40 of its lines in a fence
longer than any backtick run in the code, and the comment as written. The comments are cleared only when
the file was written and the line reached the terminal, else they stay and the header says why. After every
read a comment looks for its lines (same kinds and texts, in one hunk, nearest its old numbers) and moves
with them; when they are gone it keeps its numbers, says "Outdated" and quotes its code; a comment on a file
that left the change sits at the end of the diff and still goes, marked outdated. The comments live with the
tab's review, across scopes, and not across a restart. The selected lines take the new `mix.lineSelected`
tint over their own, a bar at the gutter and the primary text for their numbers, with contrast checks.
**Reason:** reading the agent's change and telling it what to fix belong in the same place, and a batch
reads as one instruction (the maintainer, 2026-11-17, `plans/review.md` phase 2). The first version pasted
every comment as lines of text; a multi-line paste presses Enter at each line break in a program that did
not ask for bracketed paste, and a long review crowded the prompt, so the maintainer chose a file the agent
reads and one line that names it, which works with any agent. Ctrl+Shift+Enter is free in D13 and in Claude
Code and sits beside Ctrl+Enter. The send by activity is the maintainer's (2026-11-17): at a bare shell
prompt the line landed in bash and the review left the pane. Starting an agent there with the review
(`AgentProfile.launch`, a PATH lookup through `agent:launchable`, merged in #72) was dropped the same day by
the maintainer: it made the cockpit know how each agent starts, against D24, and cost a host channel, a
shell run and a menu for a step the developer does with one word.
**How to revert:** for the send by activity alone, drop `review-send.ts` from `ui/src/review` and
`reviewSendBlock`; the line is then typed whatever runs in the tab. For the whole of it, drop `review-comments.ts` and `comment-card.ts` from `ui/src/review`, the `comments`
deps of the diff view and the send button of the pane, the `reviewSend` key, `paste` of the terminal
session, the `review:notes` channel and `createGitReviewNotes`; drop `comments` from `FileOpening` and the
`comment` and `gone` rows from `changeRows`.
## D57. GitHub is the third built-in connector, through the REST API with a rate gate

**Decision:** GitHub ships as `dck.github`, a code review connector shaped like GitLab's (`plans/github.md`):
"To review" (`github-review`) and "Follow up" (`github-mine`) as merge request items, an address that is
empty for github.com or the root of a GitHub Enterprise Server (API at `<address>/api/v3`), and the token
only in the system keyring as `github.token`. The adapter `@dck/adapter-github` reads `GET /user`, then
`GET /search/issues` with `is:pr is:open archived:false review-requested:<login>` (teams included) or
`author:<login>`, 100 per page following `Link`, at most 5 pages, and per pull request, 5 at a time,
`pulls/{n}` for the branches and conflicts and the check runs and commit statuses of its head for the CI
state; a failed lookup leaves that row's branch empty or its CI unknown. A rate gate reads
`x-ratelimit-*` and `retry-after`, fails a limited request with `DCK-GHB-004`, does not call that
resource again before its reset (60 s without one, never more than an hour), and stops the per-row
lookups while fewer than 100 requests are left; the daemon keeps one gate per address for its whole life.
Error codes `DCK-GHB-001` to `007`. GitLab and GitHub share the window's connection
(`code-review-connection.ts`) and the daemon's views service (`code-review-views.ts`), each with its own
address rules, error code and cache file. A merge request item carries its reference mark, `#` for GitHub,
and an item without one reads as GitLab's `!`. The rail badge sums the connected views that declare a
badge; with one service it keeps that service's text, with two it says "{count} waiting for your review".
A connector may declare `ciTerm`, the service's own word for the CI state: GitHub's rows say "Checks
failed" and GitLab's keep "Pipeline failed", chosen by the connector of the open tab. Settings,
Connections lists the connectors with an account first (`connectedFirst`), each group in the declared
order, so a user with only GitLab sees it above GitHub. The token hint is one line, "Fine-grained, read
only", and a quiet "Permissions" disclosure under it (`connection.token.permissions`, closed by default)
lists Pull requests, Commit statuses and Metadata read only, and the classic `repo` scope only for private
repositories; a fine-grained token cannot read check runs (GitHub gives that to App tokens alone), so on a
private repository its rows show the commit statuses or no CI state. With three services the Work header
must not break: the update time moves to the hint bar beside Refresh, the service names hide when the tabs
do not fit (measured with a `ResizeObserver`, the line between groups stays and each tab's tooltip names
its service), and past that the strip scrolls sideways with the active tab kept in view. Open discussions
are always false for GitHub: only the GraphQL API knows whether a review thread is resolved, and the HTTP
port only sends `GET`.
**Reason:** GitHub is where most developers outside GitLab shops review code; it fitted the connector
contract of D41 with no change to it. The search endpoint answers both lists with one query each, and its
own limit (30 requests a minute) is why the pages are capped and the gate exists.
**Accepted cost:** about three requests per pull request on every refresh; a review request disappears once
the user submits a review, which is how GitHub records it; with a fine-grained token the checks of
private repositories do not show.
**How to revert:** drop the `dck.github` candidate from `core/src/extensions/built-in.ts`, the adapter and
the two entries in `shell/src/connections/connector-connections.ts` and `daemon/src/connector-views.ts`;
the shared connection and views files keep working for GitLab alone.
**Partly replaced by D73** (2026-11-18): the Work button shows a dot, and a view's `badge` is a role, not a text.

## D58. The terminal cursor blinks by a timer, not by xterm's animation

**Decision:** xterm still decides which cursor blinks (the setting, DECSCUSR and mode 12) and adds its
blink class only while it has the focus, but its infinite CSS animation is turned off
(`ui/src/styles/terminal.css`) and the session hides that cursor every other 500 ms with a class
(`ui/src/terminal/cursor-blink.ts`), only while the terminal has the focus and the page is visible; a key
or a cursor move shows it again and starts the period over. The pace and the hidden phase are xterm's.
**Reason:** Chromium runs an infinite CSS animation every frame, so a blinking cursor at an idle prompt
cost about 3% of one core in the renderer and the GPU process, against 0.5% with no blink; with the timer
it is 0.6 to 0.7% (Xvfb and native Wayland, 2026-11-17, numbers in `plans/terminal-rendering.md`). The
other cheap candidates of that plan were measured and left out: xterm already stops blinking without the
focus, a hidden window already draws no frame on X11 and on native Wayland, and an opaque window at opacity
1 cost more under a compositing manager, not less.
**How to revert:** drop `attachCursorBlink` from `terminal-session.ts` and the cursor rules from
`terminal.css`; xterm then blinks by itself again.

## D59. Codex marks its tab through the terminal's program status report, with nothing installed

**Decision:** every cockpit terminal reads OSC 7501, the draft
[Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status), from whatever program
writes it, and feeds it to the attention tracker beside `dck agent signal`: `working` is working, `blocked`
needs you, `done` and `error` your turn, `idle` ends a turn in progress silently (the protocol's report for
a cancelled program, so Esc ends Codex's turn at once instead of after 5 s of quiet), `clear` ended. Only
the terminal's own record counts; a report with an `id` is ignored, and a query gets `?` back. The core
reads the report (`attention/program-status.ts`) and knows no program; the window attaches the reader to
each xterm (`ui/src/terminal/program-status.ts`). Codex's TUI writes these reports since 0.163.0
(`codex-rs/tui/src/terminal_program_status.rs`), so Codex needs no plugin, hook or `config.toml` change, and
its profile (`codex`, the native binary's process name, since the npm launcher hands its process to it with
`execve`) has no connect command and shows no hint.
**Reason:** the maintainer asked for Codex as a second agent (2026-11-17). Codex also has a `notify`
program and lifecycle hooks, but in 0.169.0 it runs every session's turns in a shared background server by
default, and the hooks and `notify` run there with the environment of the terminal that started it: in a
run with two tabs, a prompt in the second signalled the first. `notify` also fires when Codex's title
generator finishes, while the real turn is still waiting for an approval, and hooks run only after the user
trusts them in `/hooks`. The terminal report comes from the tab itself, needs no setup and is a generic
protocol (OpenTUI writes it too), so it adds no coupling to Codex (D24, D37).
**How to revert:** drop `attachProgramStatus` from `terminal-session.ts` and `onProgramStatus` from
`app.ts`, then `program-status.ts` in `core/src/attention` and `ui/src/terminal`, and the tracker's `rest`;
the Codex profile can stay, and Codex tabs then show only their process activity.

## D60. The hold menu list fits the window and cues the rows it hides

**Decision:** the list beside the wheel (D12) always opens in its sector's direction. It measures how many
rows fit between the window's top edge and the tab bar on that side of the wheel and shows every row that
fits; only a list that does not fit is windowed, with no scrollbar and a chevron strip above and below,
24 pixels tall (the WCAG 2.2 target size), with an empty strip of the same height when nothing is hidden on
that side, so the list keeps its height as the window moves. The chevron's tooltip says how many rows are
hidden there. The window moves only when the selection reaches its edge, as a scrolled list does. The
mouse wheel over the list moves the selection one row per notch, and a click on a chevron selects the
nearest hidden row without running it or taking the focus. Rows outside the window keep sizing the list,
so its width does not jump.
**Reason:** the fixed caps (5 rows up and down, 9 to the sides) hid rows that had room in a tall window and
ran off the top or over the tab bar's hint in a short one: at the default height (half the screen) the
Tabs list lost its first rows above the window. Chevrons read calmer than a fade, which dims a real row,
and than a "3 more" line, which costs a row of height; the hub already says "4 of 7". Opening a cramped
list beside the wheel was tried and dropped: on the right, the Tabs list read as the Projects list.
**Accepted cost:** the wheel sits in the middle of the window, so at half of a 1080 pixel screen the Tabs
list shows 3 of its 7 rows, and at half of a 768 pixel screen 1, while the Agent list there (1 of 3) runs
over the tab bar and its hint.
**How to revert:** restore the fixed `maxRows` and the centered `visibleWindow` in
`ui/src/hold-menu/menu-view.ts`, and drop `ui/src/hold-menu/list-fit.ts`, the measuring in the controller
and the `.cue` styles.

## D61. The hold menu wheel moves away from its list and shrinks in a short window

**Decision:** the wheel is centered over the terminal, between the window's edge and the tab bar, and
moves away from the open list only as far as the list needs to show every row, never out of that band. In a
band shorter than 400 pixels it is drawn compact, 164 pixels instead of 196, with the hub and the sectors
narrower and the labels and icons at full size; only when even the compact wheel would not fit does the
whole wheel scale down. The list always opens in its sector's direction: in a window too short for one row
between its cues there, it covers part of the wheel instead of leaving the window. The wheel moves only for
a selection made with the keys: a selection made with the pointer keeps it still and fits the list to the
room it has there. A move slides in 170 milliseconds, without motion when the system asks for less, and a
new opening places the wheel without a slide.
**Reason:** with the wheel fixed in the middle (D60), at half of a 1080 pixel screen the Tabs list showed 3
of its 7 rows, and in a 360 pixel window the Agent list ran over the tab bar and the Tabs list off the top.
Moving the wheel shows the whole Tabs list at half of a 1080 pixel screen and keeps every list inside the
window at every height. A wheel that moved under a still pointer would slide its sector away and select
another one, so the pointer never moves it. Opening a cramped list beside the wheel was tried again and
dropped by the maintainer (2026-11-17): the sector's direction stays, as in D60.
**Accepted cost:** the wheel changes place as the keys move between sectors in a short window; at a third
of a 768 pixel screen the Tabs and Agent lists show one row and cover the top or bottom of the wheel.
**How to revert:** drop `placeWheel`, `wheelSize` and the overlap from `ui/src/hold-menu/list-fit.ts`,
the compact geometry from `menu-view.ts`, the placement in the controller and the `--wheel` and `top` rules
in `styles/hold-menu.css`, and set the card back to `position: relative` in the centered flex scrim.

## D62. A tab is renamed in place and keeps its automatic name underneath

**Decision:** the tab's name turns into a field on the tab itself, opened by a double-click on the tab, by
Rename tab in its context menu and in the hold menu's Tabs list, and by `Ctrl+Shift+R` (`⇧⌘R` on the Mac)
for the active tab. Enter or a click elsewhere keeps the name, Esc leaves the old one, and an empty field
brings back the automatic name, which shows in the field as its hint. The automatic name stays what it
was (the project's name, or "shell N"); a typed name only covers it. A name is at most 64 characters,
trimmed, with its spaces joined. While the field is open the tab bar does not redraw, so an attention mark
arriving then shows once the edit ends.
**Reason:** the maintainer asked to name a tab beyond the folder it opened in (2026-11-17). Editing in place
was chosen over a small dialog: it keeps the eye on the tab and costs no extra surface. Following the
terminal's current folder was offered and declined: the automatic name stays as it was.
**How to revert:** drop `renameTab` and `autoLabel` from `core/src/tabs/tabs.ts`, `rename` from
`ui/src/tabs/tab-bar.ts`, the `renameTab` shortcut, the menu items and the `.tab-name` styles.

## D63. The hold menu has no tab switcher

**Decision:** the tab switcher of D12 (Space with the trigger held, a card of tabs by most recent use) is
gone. The tab bar is where tabs are picked; the hold menu's Tabs list keeps next, previous and next
waiting for you, and Ctrl+Tab and Alt+digit stay.
**Reason:** the maintainer found the switcher ugly and had never come across it (2026-11-17): it showed
nowhere in the interface or the shortcut table, and with many tabs its card ran edge to edge, over the
side panel, and out of a short window. The tab bar already does the job.
**How to revert:** bring back `core/src/tab-switcher/`, `recentTabs` in `core/src/tabs/tabs.ts`, the
switcher mode of `ui/src/hold-menu/hold-menu-controller.ts` with its Space key, `switcherMarkup` in
`menu-view.ts`, its styles in `hold-menu.css` and the `menu.switcher.*` texts.

## D64. The tabs of the last run open again on start

**Decision:** on start the window opens the tabs of the last run in their order, each in the folder its
terminal was in (it follows `cd`), with the name the user gave it, and activates the one that was. A
project's tab keeps its project's name and stays tied to the project. A folder that is gone opens the
home folder. What ran in a tab (an agent, a server) does not come back: only its shell, in its folder.
The window writes `open-tabs.json` in the app's data folder after every change of the tabs and every
`cd` the watcher sees, debounced and only when something changed; the host validates it with zod and
writes it atomically. "Reopen the tabs on start" in the Window group of the settings turns it off; it is
on by default.
**Reason:** the maintainer asked for the tabs, by folder and with their names, to survive a restart
(2026-11-17), and chose the terminal's current folder over the one the tab opened in.
**How to revert:** drop `core/src/tabs/saved-tabs.ts`, the `tabs` part of the host API and its channels,
`shell/src/tabs/saved-tabs-file.ts`, the `window.restoreTabs` setting and `restoreTabs` and
`saveTabsSoon` in `ui/src/app.ts`, and open one tab on start again.

## D65. settings.json works like VS Code's settings file

**Decision:** `settings.json` takes comments (`//`, `/* */`) and trailing commas. When the settings screen
or `dck ext` changes a value, only that value's text changes: the user's comments, key order, layout and
every other value stay as written (Microsoft's `jsonc-parser` behind the `SettingsText` port, adapter
`@dck/adapter-jsonc`); a new key goes on its own line, so a comment beside the last value stays there. A
file that does not exist yet is still written as plain pretty JSON with every value, and writes stay
atomic. The window watches the file and applies any field saved by hand at once, through the same change
path as the screen, so theme, language, opacity, shortcuts and the rest need no restart; a save of the
window's own reads back the same text and applies nothing twice. A global shortcut written by hand goes
through the same veto as the screen: a key the system refuses keeps the previous one, the file keeps what
the user wrote, and the screen says so. A file that is not valid JSON with comments (or whose top is not
an object) keeps the settings in use, is never written over, disables the screen's controls until it is
fixed, and one line above the page (not across the screen) says the line and column of the first error,
with a button that opens the file. A value of the file the model did not use as written (went back to its
default, clamped or corrected, left out of a list or map, not a setting at all, refused by the system, a
projects folder that does not exist) is told where it is fixed: under its setting, what the file holds and
what is used instead, and the setting's reset writes the right value into the file even when the one in
use is already the default; the pages holding one get a mark, and so does the button that opens the file,
whose tooltip counts them ("Open the settings file: 3 warnings"); an unknown key shows only there and in
the file. Nothing stacks at the top of
the screen however many there are. A number typed on the screen out of range says beside its field what it became, and the
projects folder field says when its folder does not exist. "Open the settings file", a button in the
screen's header and an item in the hold menu's System list, opens the file in the system's default editor
through the host (`settings:open-file`, which takes no path), writing it first when there is none. D41's
`dck ext` keeps working on a commented file and keeps its comments.
**Reason:** the maintainer wants the user to shape the cockpit by hand like in VS Code: it applies as soon
as it is saved, takes comments, has a button that opens it and says which field it ignored (2026-11-17,
`plans/personalization.md`, front B). QA also found "Notify a long command after" typed as 2 silently
became 5, and a projects folder that does not exist was saved with no word. A first list stacked at the
top of the screen was refused by the maintainer (2026-11-18): it grows with the file and spoils the screen.
**Accepted cost:** a new adapter package for a parser; a value the model corrected stays as written in the
file until the user or the screen changes it, so its warning stays; while the file is broken the
screen, the theme shortcut and the opacity keys change nothing; a key inserted into a group the user wrote
on one line breaks that group into lines. Removing a connector's address by hand forgets its token, as
the screen's Disconnect does.
**How to revert:** drop `packages/adapters/jsonc`, the `SettingsText` port, `core/src/settings/settings-file.ts`,
`reload`, `ensureFile`, `onFile` and the edits in `shell/src/settings/settings-store.ts`, the
`settings:file` and `settings:open-file` channels, the warnings, strip, button and notes in
`ui/src/settings/settings-view.ts` and the hold menu item, and go back to `JSON.parse` and whole-file writes
with `reloadExtensions` for D41.

## D66. The terminal draws with the user's terminal font; the interface keeps the cockpit's, shipped

**Decision:** Inter and JetBrains Mono ship with the interface (`@fontsource-variable`, OFL) and the
tokens name them first, so the cockpit looks the same on every machine. The terminal's font is, by
default, the one the user's own terminal draws with: the GNOME Terminal default profile's, then Ptyxis's,
when it does not follow the system's; else the system's monospace font (GNOME, then fontconfig); else
JetBrains Mono. A port `SystemFonts` reads it, with the installed families and the fonts that draw
Powerline's arrow (U+E0B0); macOS and Windows answer nothing for now. The terminal's font list is the
chosen font, the user's terminal's, the system's, JetBrains Mono, then up to three of those symbol fonts
(a symbols-only font first, then monospace ones; proportional and emoji fonts are left out). Settings
`appearance.fontFamily` and `appearance.codeFontFamily` (null is the cockpit's), `terminal.fontFamily`
(null is the system's), `terminal.cursorStyle` (block, bar, underline) and `terminal.cursorBlink`; a font
name must be letters, digits, spaces and `. _ -`, so it cannot break out of a CSS list. Every change
applies at once to every tab, after the new font has loaded.
**Reason:** a colleague's zsh prompt showed boxes (2026-11-17). Chromium never looks through the system's
fonts for a private use character, so a Powerline glyph draws only from a font the page names; checked in
the real app with Symbols Nerd Font installed: boxes before, arrows once it is in the list. The maintainer
chose to keep the cockpit's fonts for the interface, ship them, follow the font of the terminal the person
uses, and offer the cursor shape some people prefer.
**How to revert:** drop `core/src/fonts`, the `SystemFonts` port and `shell/src/platform/linux/
system-fonts.ts`, the `fonts` part of the host API, the `appearance` and `terminal` settings and their
rows, `ui/src/platform/appearance.ts`, and the `@fontsource-variable` imports; the tokens go back to the
system's Inter and JetBrains Mono.

## D67. The window's bottom edge sets its height

**Decision:** the bottom edge of the window is a handle, a 6 pixel strip with no visible grip: the resize
cursor and a thin line on hover, no tooltip (it would cover the tab names whenever the pointer brushes the
edge). Dragging it moves the window's bottom while its top stays, a label as tall as a tab, centered on the
tab bar and on the line of the tab names, shows the height in percent of the work area, and on release the
height is saved as `window.heightRatio`, so the next opening keeps it and the slider in the settings
follows. The limits are those of the setting (30% to 100%), the window follows the pointer to the pixel (the
height is kept to a thousandth, so release does not jump), the edge snaps to 50% and 100% within 12 pixels,
and Esc while dragging puts the window back. At full height a drag leaves it at once (the tab bar goes back
under the terminals as the drag starts) and sets the anchored height where it is released; a double click on
the edge switches full height. While the edge moves, the terminals keep their grid and fit when the pointer
rests 150 ms and on release, so a shell or a TUI redraws once instead of on every frame. With the height
locked by `DCK_HEIGHT` the edge is not offered. The window asks the host for each height (`window:resize`,
one request at a time, validated with zod) and ends with `window:resize-end`; the host moves the window
through the dock controller, which drops a reapply left by the last show so it does not pull the window
back. Whenever the window takes the whole height, at full height or with an anchored height of 100% (dragged
there or set in the settings), it lays out for the whole screen as full height does: the tab bar on top and
the panel opened if the setting asks; below 100% the bar goes back down (while dragging it stays down, by
the label).
**Reason:** people asked to change the height with the mouse, as in Guake or Yakuake (2026-11-18). The
window manager's own resize was left out: it would also change the width and the top of an anchored
window, and a frameless window has no edge to grab under Wayland. The maintainer chose that a drag leaves
full height.
**How to revert:** drop `dragRatio`, `resizeTo` and `endResize` from `core/src/dock/dock-controller.ts`,
the `window.resize` and `window.endResize` channels, `ui/src/window/resize-edge.ts`, the `#edge` and
`#edge-size` elements and styles, and `holdFit` in the terminal session.
**Amended by D80** (2026-11-19): a drag released at 100% turns full height on instead of saving 100%.

## D68. On a Mac the terminal edits the line with Cmd and Option, and the right Option types characters

**Decision:** [plans/mac-keys.md](../plans/mac-keys.md). On a Mac keyboard, while xterm's normal buffer
is active, the terminal sends the shell's line editing keys in place of xterm's own sequence
(`ui/src/terminal/line-editing.ts`): `⌘←` `^A`, `⌘→` `^E`, `⌘⌫` `^U`, `⌥←` `ESC b`, `⌥→` `ESC f`, `⌥⌦`
`ESC d`; `⌥⌫` stays xterm's `ESC DEL`. A full-screen program in the alternate buffer gets the raw key. The
left Option is Meta and the right one types characters: xterm has a single switch, so
`ui/src/terminal/option-key.ts` sets `macOptionIsMeta` before each key by which Option is down (`AltRight`
in `event.code`); a key with no Option held or a lost focus puts it back. The setting
`terminal.macOptionAsMeta` (`left`, the default, `both`, `none`) has a row in the Terminal group on a Mac
keyboard only. `⌥`+drag selects inside programs that use the mouse (`macOptionClickForcesSelection`).
`⌘K` on a Mac and `Ctrl+Shift+K` elsewhere clear the terminal, screen and scrollback, keeping the
prompt's line, with an item in the hold menu's Tabs list. The 9 of the tab digits goes to the last tab
(`⌘9`, `Alt+9`). The hold menu key on a Mac defaults to the right Command (`MetaRight`), which types
nothing and leaves both Options to the terminal; the right Super was offered only on a Mac keyboard,
since the desktop takes Super elsewhere, until D69 made the hold menu key a recorder that takes any key
that types nothing. The global key stays F12; on a Mac keyboard Settings writes it
in the Mac's symbols (`⌥⌘K` for `Super+Alt+K`) and says the F keys need fn unless they are standard
function keys.
**Reason:** the maintainer's choice on 2026-11-18. In xterm 6 on a Mac `⌘←`, `⌘→` and `⌘K` did nothing,
`⌘⌫` sent a plain DEL and `⌥←` sent `CSI 1;3D`, which zsh prints as `;3D`. The sequences are VS Code's
`sendSequence` defaults and iTerm2's Natural Text Editing preset; the clear and the last tab follow VS
Code, browsers and Ghostty; the split Option follows iTerm2 and Ghostty
(`macos-option-as-alt = left`), so `@`, brackets and accents work again on international layouts.
Checked on Linux with the app reloaded as a Mac keyboard: each sequence edits a bash line, the raw key
reaches a program in the alternate buffer and the PC keys are unchanged; the Option keys, `⌥`+drag and
the fn hint need a real Mac.
**How to revert:** drop `line-editing.ts` and `option-key.ts` and their handlers in `terminal-session.ts`,
`macOptionClickForcesSelection`, the `terminal.macOptionAsMeta` setting and its row, `clearTerminal`
from the keymap with its action and hold menu item, the `'last'` tab target, set `HOLD_TRIGGER.mac` back
to `AltRight` and drop `accelerator` from the keymap.

## D69. Every interface key and the hold menu trigger are the user's to change

**Decision:** [plans/custom-shortcuts.md](../plans/custom-shortcuts.md). The Shortcuts page lists every
action of the keymap (`SHORTCUT_IDS` in `core/src/settings/shortcut-keys.ts`) in four groups, Tabs,
Review, Window and Appearance, one row each. The row's keycaps are its button: a click or Enter records
the next chord in place, with the global key's prompt and `inputGate`; Esc cancels, a click elsewhere
ends it, and the row keeps its height. A letter, digit, symbol or editing key needs Ctrl, Alt or Cmd
(Shift alone only types the capital); F keys, Insert, Pause, Scroll Lock and the Menu key may stand
alone. `settings.json` keeps only what the user changed, in `"shortcuts": { "keys": { "newTab": "Ctrl+T" } }`,
written `Ctrl`, `Alt`, `Shift` and `Super` on a PC and `Ctrl`, `Option`, `Shift` and `Cmd` on a Mac; any
of those names (also `Control`, `Command`, `Meta`) and Electron's key names (`Up`, `Plus`, `Space`,
`Return`) read back the same. An entry that names no action or holds no such chord is dropped and listed
as a settings.json warning. A custom chord replaces every default chord of its action (alternates
included), wins over a default key and a tab digit that would match too, and works at once: the keymap
reads the setting at each key. A chord that another action, the global key or the hold trigger answers
to is held back with "Already used by" and Swap, which gives the other one this row's previous key when
it can take it, and Cancel; a chord the shell reads (Ctrl and a character with no Shift or Alt on a PC,
any Control chord on a Mac) is allowed with a note that the terminal no longer gets it. A recorded
default saves nothing, each row has its reset and Restore all defaults removes every custom key. Labels
come from the keymap everywhere: the rows, the hold menu, the review header, and the tooltips, which
name the action with `data-tip-shortcut` (index.html too) and ask the keymap when they show. The hold
menu key becomes a recorder like the global key: one key that types nothing, by its `KeyboardEvent.code`
(modifiers, F keys, lock keys, Insert, the Menu key), or the middle, back or forward button, stored as
`Mouse1`, `Mouse3` and `Mouse4`; a key the terminal needs and the left and right buttons are refused with
the reason, and the earlier values stay valid. Held, a mouse trigger opens the wheel as the key does,
moving selects, releasing runs and Esc cancels; while it is the trigger its own mousedown, mouseup,
click, auxclick and context menu are consumed, so Linux's middle-click paste, a program's mouse report
and back or forward do not happen. The wheel is drawn above Settings, the views, the search and the tab
list, so a trigger tried right after recording it opens in sight (it used to open under Settings, unseen);
only the quit card and the tooltip stay above it. A mouse that sends press and release together opens it
with a click and leaves it open (D79). Keys inside panels (the review's single keys, arrows in
lists) stay fixed.
**Reason:** the maintainer's choice on 2026-11-18, on top of D68: people bring keys from other terminals
and editors, and a MacBook or a mouse with side buttons has no right Ctrl to hold. Swap in place keeps a
conflict a one-click choice, without a modal. Checked on Linux under Xvfb with the PC keyboard and with
the app reloaded as a Mac keyboard, in both themes and languages: recording, refusal, Swap, reset, the
custom key working and the old one not, the tooltip, the hold menu and the review following a change,
the wheel on the middle button running a row on release, and the middle click no longer pasting.
**How to revert:** drop `shortcuts.keys` and `shortcut-keys.ts` (the keymap takes its defaults again),
`data-tip-shortcut` (back to `data-tip-key` with the keymap's label), `key-slots.ts` and the rows of
`shortcuts-page.ts` (back to the reference list), `hold-trigger.ts` and the mouse handling of
`hold-menu-controller.ts`, and give `shortcuts.holdTrigger` back its list of five keys and its select.


## D70. The review reads inside submodules and lists every changed file

**Decision:** [plans/submodule-review.md](../plans/submodule-review.md). The review shows the files of each
changed submodule with real diffs, in every scope and at every nesting level. The `node-git` adapter reads
a submodule as its own repository: `git diff` from the commit the parent recorded at the scope's start
(the empty tree for a new submodule) to the submodule's working tree, so its new commits and its edits
read as one diff, as `git diff --submodule=diff` shows; its untracked files; the subjects (at most 10) and
count of its commits after the recorded one (`log old..HEAD`); and its own submodules the same way. A
submodule with only untracked files is not in `git diff`, so the parent's `git status` names it (`S..U`).
Files keep their paths from the top repository and name the innermost submodule that holds them, so
comments, Viewed, the keys and "Send to agent" work as on any file. A submodule that cannot be read (not
checked out, its recorded commit not fetched, deleted) stays the single "Submodule" entry it was. The
index is a tree: the repository's own files first, then a group per submodule (path, "Submodule" tag, file
count, up to 3 commit subjects then "+ N commits") that folds with a click, Enter or ←→, its files under
it with paths inside it and nested submodules nested the same way; the commits' tooltip lists one line
per commit, cut near 60 characters, at most 5 (the maintainer found 10 too tall), then "+ N more". A diff header boxes the submodule's
folder before the rest of the path. The panel's submodule rows are buttons that open the review on their
group. Every changed file is listed: past 300 untracked files, counted across all repositories in the
order shown, a file is listed without its content, says "Not loaded" in the index and "Content not
loaded" in its header, and is read on a click or Enter through `review:untracked` (a known root and a
path inside it); the 1 MB per file limit stays and the 32 MB limit counts every repository's diff
together. The fingerprint adds the status of each changed submodule, nested ones too, at most 16 read one
at a time, sharing the 2000 stamped paths, and stamps paths from the repository's top.
The panel's Git section opens the review too: a changed or staged file's row opens the diff on that file
(an untracked folder on its first file), and the branch line opens the review where it was.
**Reason:** decided with the maintainer (2026-11-18): a changed submodule read as two "Subproject commit"
lines told nothing, and untracked files past the 300th were dropped with no sign. Reading each submodule
by itself instead of parsing `--submodule=diff` gives clean paths, the commits for the header, the
untracked files git leaves out and one code path for every nesting level. "Not loaded" is the index's
short form: in a 240 pixel index the whole sentence cut the file name.
**How to revert:** drop `gather`'s submodule branch in `node-git/src/git-diff.ts` (submodules go back to
single entries), `core/src/diff/modules.ts` and `ui/src/review/module-row.ts`, the file list's groups
(back to a `listbox` of files), `openModule` in the Git section, the `review:untracked` channel with
`unloaded` (the untracked list then stops at 300 again) and the submodule statuses in `fingerprint`.
**Partly replaced by D78** (2026-11-18): each submodule is read with the scope applied inside it; the
commits after the one the parent recorded stay in its header, and their files leave the review.

## D71. Updates from the project's GitHub releases, off until the user opts in

**Decision:** [plans/auto-update.md](../plans/auto-update.md). The setting `system.updates` is `off` (the
default), `notify` or `install`, a row in Settings > About (moved there from System, beside the version) with "Check now" beside it (disabled while
off) and the last check's answer in the row's line. Off, the cockpit never contacts GitHub. Notify and
install read the public `releases/latest` endpoint of `higorabreu/dev-cockpit` five seconds after start
and every 12 hours, with no token and only a `dev-cockpit/<version>` User-Agent; drafts, prereleases and
a tag that is not a version are skipped and versions are compared by semver (`core/src/updates`). A newer
release shows a notice at the end of the tab bar (the `#notice` spot, apart from the bar's buttons by a
line, covering no tab; a copy notice shows over it for a moment): "Version 0.10.0 available" with
"Update", "What's new" (the release page, opened by the host, which never takes an address from the
window) and a dismiss that hides it until a newer version (`updates.json` in the data folder). While an
update can be taken the hold menu's System list has "Update to 0.10.0". Install mode, or "Update", on
Linux with the `.deb` in `/opt/dev-cockpit`: the package for the running processor is downloaded to a
private temporary folder and hashed while written, its SHA-256 is compared in core with the release's
`SHA256SUMS` (a mismatch is refused, the file removed and the notice says so), and `pkexec apt-get install
-y` installs it; a dismissed password dialog (pkexec's 126) offers the update again and is not retried by
itself in that run. Then "Updated to 0.10.0" with "Restart": the cockpit never restarts by itself, and if
not restarted the new version runs on the next start. With an agent running in a tab, "Restart" asks in
the notice first ("1 tab has an agent running", Restart anyway, Cancel). A restart writes the tabs, waits
for the write, then `app.relaunch()` and a clean quit. Failures (`DCK-UPD-001` to `006`) end in a short
notice and a `logger.warn`. A Mac or Windows build, and a Linux app not installed from the `.deb`, only
point to the release page. The release workflow builds the arm64 `.dmg` on a macOS runner, attaches it to
the same release and lists it in `SHA256SUMS`; a failed Mac build does not hold the `.deb` packages back.
A development run reads a local feed from `DCK_UPDATE_FEED` (the packaged app ignores it).
**Reason:** the maintainer's choice on 2026-11-18: updating meant downloading, checking and installing the
`.deb` by hand. Opt-in, so a fresh install makes no network call of its own; the checksum guards against
a corrupt or swapped download, and polkit's own dialog asks for the password rather than the cockpit. The
Mac build is signed ad hoc, so it cannot replace itself; it gets the link. The release workflow's Mac job
has not run yet.
**How to revert:** drop `core/src/updates`, `ports/updates.ts`, `release-source.ts` in
`@dck/adapter-github`, `platform/linux/deb-installer.ts`, `shell/src/updates`, the `updates` part of the
host API and its channels, `ui/src/updates`, the lasting part of `ui/src/tabs/notice.ts`, the
`system.updates` setting and its row, the `DCK-UPD-*` codes and the `build-mac` job.

## D72. Settings has an About page with the version, the updates and the project's links

**Decision:** a last page, About, names the cockpit (no tagline, the maintainer's choice), the version that runs (`about:version`
from the host's `app.getVersion()`), the Updates row moved there from System, and four links: GitHub (the
repository), What's new in this version (the release notes of the running version's tag), Report a problem
(a blank new issue) and the AGPL-3.0 license. The window names a link (`about:open` with one of four names,
validated with zod) and the host builds the address on the cockpit's own repository, so no address comes
from the window. No people are named; the repository carries the authors.
**Reason:** suggested by a colleague of the maintainer (2026-11-18); the maintainer chose to move the
updates beside the version, to open a blank issue rather than one filled with the version and system, and
to name no authors.
**How to revert:** drop the `about` tab of `ui/src/settings/settings-view.ts` and its styles,
`core/src/about/about.ts`, `shell/src/updates/about-bridge.ts` and the `about` host API, and put the
Updates row back in System.

## D73. A dot on the Sessions and Work buttons while something waits

**Decision:** [plans/rail-badges.md](../plans/rail-badges.md). The rail shows no number: the Sessions
button and the Work button get a dot while something waits for the user, the one the app already uses
for the settings file warning and the compact update icon (6px, round, a 1.5px ring in the window color),
at the icon's upper right and in the neutral foreground, since nothing is wrong. The tooltip stays the
title and its keys; the label adds the count for the screen reader, "Work, 4 items waiting", "Trabalho, 4
itens aguardando". One helper, `ui/src/kit/rail-dot.ts`, serves the panel sections and the Work button.
A connector view's `badge` is a role instead of a plural text key: `review` counts every item (GitLab
`review`, GitHub `github-review`) and `attention` the user's own merge requests that need them (`mine`,
`github-mine`). A merge request needs the user while its CI failed, or when it has an open discussion and
its `updatedAt` is newer than the version last seen (`needsAttention`, `core/src/views/attention.ts`).
Showing an `attention` tab in the Work screen with the window visible marks what it lists as seen; the
marks (view id, item id, `updatedAt`) live per machine in the window's `localStorage` (`dck-seen-v1`), and
a fetched list drops the marks of items that left it. Warming refreshes the `attention` views as well as
the `review` ones.
**Reason:** decided with the maintainer (2026-11-18). A count capped at "9+" was built first; the
maintainer preferred a dot and a short tooltip: the number grew the pill over the icon and the breakdown
grew the tooltip. Without a visible text the per-service wording of D57 had nothing left to say, so the
role replaces it.
**How to revert:** put `badge` back as a plural catalog key in `core/src/connectors/connector.ts` with the
`views.waiting` texts and the count in the pill, drop `kit/rail-dot.ts`, `views/seen-marks.ts` and
`core/src/views/attention.ts`, and give the sections back a `badge()` text.

## D74. On a narrow window the update notice is one icon with a menu, and a middle click closes a tab

**Decision:** [plans/tab-bar-refinements.md](../plans/tab-bar-refinements.md). The update notice (D71)
keeps its text and buttons while the tab strip keeps at least 508 px beside it (three tabs at their widest,
168 px each); with less it becomes one 26 px icon button, the size of the bar's own buttons: a download
arrow drawn like the rail icons, with a dot for news to act on, a diamond in the warning color while a
restart asks about running agents, a failure glyph in the critical color, and no dot and no menu while the
download or the install runs. Its tooltip and name are the full notice's text; a click, Enter or Space
opens the tab bar's own small menu (`tabs/tab-menu.ts`) with the same actions as the full notice in that
state, its right edge on the icon's (4 px from the window only if it would overflow) and 6 px off the bar,
and Esc gives the focus back to the icon. Restart chosen there with an agent running brings the menu back
with Restart anyway and Cancel under a caption that says why (muted, one line, never focused, the menu's
name); nothing restarts by itself. A new update state closes the menu, so it never offers what no longer
applies. The rule is measured, not a window
breakpoint: the notice measures its full form whenever it changes and compares the room the strip would
keep, so it follows the language, the state and the window's width, and never the number of tabs (opening a
tab never changes the notice's form). A copy over the compact notice holds its box and shows where it
would show over the full notice, out of the flow; meanwhile the strip is masked to end where the full
notice would end it, with its own 24 px fade (`#tabs[data-covered]`), so no tab moves, no tab text sits
under or against the copy, and the gap before it is the full notice's to the pixel. A middle
click on a tab closes it with no question, the same path as the menu's Close and the close key; its press
and release are cancelled, so Linux pastes no primary selection and nothing scrolls or takes the focus.
When the middle button is the hold menu's trigger (`Mouse1`, D69) the click keeps that meaning.
**Reason:** the maintainer's choice on 2026-11-18. At 1366 px the full notice is about 330 px and leaves the
tabs more than 900; at 900 px it would leave them less than 480, and in the narrowest windows almost
nothing. A fixed window width would break with the language and the state; a rule on the tabs' own width
would make the notice change form as tabs open. Middle click to close is what browsers and terminals do.
**How to revert:** drop the compact form from `ui/src/tabs/notice.ts` and `ui/src/updates/update-notice.ts`
with its styles in `tab-notice-and-menu.css` and `#tabs[data-covered]`, the `updates.downloadingPercent`
text and the `align` and `caption` options of `tab-menu.ts`; drop the middle
click listeners in `ui/src/tabs/tab-bar.ts` and `holdsMiddleButton` in `core/src/settings/hold-trigger.ts`.

## D75. On a Mac the right click opens a menu, and ⌘Q asks while a tab runs a program

**Decision:** [plans/mac-menu-quit.md](../plans/mac-menu-quit.md). On a Mac keyboard a two-finger tap or
Ctrl+click in a terminal opens the tabs' small menu at the pointer with Copy (disabled without a
selection), Paste and Select all, each with its key as keycaps (`⌘C`, `⌘V`, `⌘A`, which the Edit menu and
xterm already give); arrows, Enter and Escape work and the focus goes back to the terminal. Linux and
Windows keep pasting on right click. Ctrl+click never reaches xterm on a Mac, so it neither clears the
selection the menu copies nor reaches a program that reads the mouse, and links and paths still open with
`⌘`+click only (D40, D68). xterm's `rightClickSelectsWord` is off on every system: selecting copies, so
the word under a right click would replace the clipboard before Paste. On a Mac `⌘Q`, the app menu's Quit
and the menu bar icon's Quit go through `shell/src/quit/quit-guard.ts`: it reads the foreground of every
open terminal afresh (the session inspector, as the panel does) and quits at once when all sit at their
shell; otherwise it shows the window and asks with an in-app card, "Quit Dev Cockpit?" and one line with
how many tabs run a program, Cancel focused, Quit beside it. Escape cancels, a second `⌘Q` while it asks
quits, and the cockpit's keys stay quiet under the card. The window answers through `quit:answer`,
validated with zod, and an answer nobody asked for is ignored. Linux quits at once from the tray. A
logout, a shutdown or the system's own quit event never asks, so the system never waits on a hidden
window.
**Reason:** the maintainer's choice on 2026-11-18. On a Mac the secondary click is the context menu gesture
and pasting there surprised; Terminal.app and iTerm2 offer the same three items. `⌘Q` beside `⌘W` ended
agents and servers with no warning. The card follows the window's own look rather than a native dialog,
which the cockpit uses only for the folder picker, and Cancel takes the focus because on a Mac the action
that loses work is not the default. Checked on Linux under Xvfb with the window reloaded as a Mac
keyboard, in both themes and languages: the menu with and without a selection, Escape and the focus,
Ctrl+click keeping the selection, and the card with its answers sent back; the guard's count is covered by
tests, since only a Mac routes its menu through it.
**How to revert:** drop `openMenu` from `clipboard-behavior.ts` (the right click pastes again) with the
Ctrl+click guard, `openTerminalMenu` in `app.ts`, `key` in the tab menu, the session's menu methods,
`shell/src/quit`, `ui/src/quit` and its style, the `quit` host API and channels, `pids` in the bridge and
`asksBeforeQuit`, and give the menus `app.quit` again.

## D76. The cockpit installs from npm through a small installer, `npx @devcockpit/install`

**Decision:** [plans/npm-installer.md](../plans/npm-installer.md). The npm package `@devcockpit/install`
(organization `devcockpit`, since D9's `dev-cockpit` is taken on npm) is an installer, not the app: one
esbuild bundle with no runtime dependencies, for Node 18 or newer. It reads the latest stable release of
`higorabreu/dev-cockpit` (or `--version x.y.z`) through the GitHub adapter of D71, with only its version
in the User-Agent, picks the file for the system with core's `releaseFiles`, checks it against
`SHA256SUMS` in a private temporary folder and installs it, so the result is the manual install's. Debian
and Ubuntu (x64, arm64): `sudo apt install -y` after a line saying sudo may ask for the password (root
runs apt directly; an older release named with `--version` passes `--allow-downgrades`). An Apple Silicon
Mac: the `.dmg` mounted read only inside that folder, the app copied with `ditto` beside the old one and
swapped in only after the copy, the image detached, `Contents/Resources/bin/dck` linked into the first
writable of `/usr/local/bin`, `~/.local/bin`, `~/bin` and `/opt/homebrew/bin` on the PATH (a `dck` that is
not ours is left alone and the line to replace it printed); sudo only when `/Applications` is not
writable. A file downloaded by Node carries no quarantine attribute, so the ad hoc signed app opens without
Gatekeeper's prompt; the installer strips no attribute. Other Linux systems, Intel Macs and Windows get a
message pointing to the Releases page and exit 1. `--download-only` stops after the checksum. The same
installed version says so and exits 0; a newer installed version is kept. Failures are `DCK-INS-001` to
`006` (and `DCK-UPD-003`). The output is English only: the installer runs before any setting exists. The
release download moved from the shell into `@dck/adapter-node-fetch` so the updater and the installer
share it. The package's version bumps with the app through release-please, and the release workflow's
`publish-npm` job publishes it with npm trusted publishing (OIDC, provenance, no stored token) once the
packages are attached, only while the repository variable `NPM_PUBLISH` is `true`.
**Reason:** the maintainer's choice on 2026-11-18, to install like the Claude Code CLI. An installer
rather than the app on npm keeps the package small and the result identical to the `.deb` (menu entry,
global key, updates of D71). The bundle is about 870 kB, most of it zod, kept because the adapters check
GitHub's answer with it; it is not minified so it can be read before it runs with sudo.
**How to revert:** drop `packages/install`, its release-please extra file, the `publish-npm` job, the
`DCK-INS-*` codes, `macImageName` and `tagged()` if nothing else uses them, the npx paragraph of the
README, and deprecate the package on npm.

## D77. Extensions can be installed from npm, without running npm

**Decision:** besides a local folder and a git URL, `dck ext install` takes an npm package
(`dck ext install @devcockpit/<name>[@version]`). The cockpit reads the package from the registry itself,
checks the tarball against the registry's SHA-512 `integrity`, unpacks it into the extensions folder and
loads its `dck-extension.json` through the same rules as any installed extension. No lifecycle script runs
and no dependency is installed; a package that declares dependencies is refused until the extension host
(phase 3) settles how code extensions bring theirs. Official extensions live under the `@devcockpit` scope,
which only its members can publish to, so the scope marks what the project ships; third parties publish
under their own name with the keyword `dck-extension`. The registry address is a setting, the public
registry by default. `npm install -g` is not a way to install an extension: the cockpit never looks in
Node's global folder.
**Reason:** the maintainer's choice on 2026-11-18, after creating the `devcockpit` npm organization for the
installer (D76). npm already gives versions, a name space, integrity hashes and hosting, and authors
already know how to publish there. Unpacking the tarball instead of calling npm keeps the install free of
the scripts that make npm packages a common attack path, and leaves Node and npm optional for users.
**How to revert:** drop the npm source from `dck ext install` and `dck ext update` and its setting; folder
and git installs stay.

## D78. Each submodule is reviewed as its own repository, with the same scope inside it

**Decision:** partly replaces D70. Like VS Code, the review reads each submodule as its own repository and
applies the chosen scope inside it (`gatherModule` and `ownStart` in `node-git/src/git-diff.ts`).
Uncommitted: its working tree against its own HEAD (staged, unstaged and untracked), none of its commits.
Unpushed commits: its commits not on its own upstream and its working tree, as the parent's scope compares
the merge base with its upstream to the working tree; a submodule with no upstream shows its uncommitted
edits only, never the parent's "No upstream" state. Base: its branch against its own base, found in its
repository the way the parent's is (D49: VS Code's merge base, the branch's creation, the nearest branch;
the user's pick names a branch of the parent and does not apply inside). A branch with no base found,
usually the integration branch the submodule pulls (`develop`, `main`), falls back to its Unpushed: the
merge base with its own upstream, else its HEAD, so pulled commits never fill the review. Only a detached
HEAD starts at the commit the parent recorded at the scope's start, as D70 did. The commits between that
recorded commit and the submodule's HEAD (a pull, a branch switch inside it) stay in the group's header,
"+ N commits" with at most 5 subjects in the tooltip, but their files are no longer listed. A submodule
whose pointer alone moved keeps its header with no files and no count (its screen reader name leaves a
zero out too); when nothing else changed, the diff's place says "No file changes to review" beside the
index, which lists the headers and keeps the arrows' hint in the hint bar. Uncommitted reads the
submodules the parent's status names (moved pointer, modified content, untracked files); Unpushed and Base
read every checked out submodule the parent records (`.gitmodules`, confirmed by the index), since one
can have commits of its own while the parent's pointer stayed, and skip one with nothing to show and no
moved pointer. Nested submodules follow the same rules inside the one that holds them. The rest of D70
stays. The fingerprint already reads the status of each submodule the parent's status names, so a move of
a submodule's HEAD, index or working tree changes it; a push or fetch inside a clean submodule shows on
the next read (Ctrl+R, the agent, any other change). The base finder keeps 64 findings instead of 16, so
the submodules of a Base read do not push the parent's out on every refresh.
**Reason:** the maintainer's decision (2026-11-18), after a real repository showed `backend` with 446
files and "+169 commits" under Uncommitted: diffing from the recorded commit folded every pulled commit
into a scope meant for what the user did. A submodule on the branch it pulls has no base by D48's rule
(on the remote's default branch the nearest is not a base), and the recorded commit would bring every
pulled commit back under Base; its unpushed work is what the user did there. A detached HEAD, the usual
state of a submodule that
`git submodule update` checked out, has no branch whose base could be found; starting from the parent's
recorded commit then shows what the parent's branch moved it through, the nearest meaning of "this
branch" for it, and it is what the review did before.
**How to revert:** in `gatherModule`, start the submodule's diff at the recorded commit again (drop
`ownStart`), stop reading `recordedModules` in `gather`, and drop the pane's `pointersOnly` state and its
two catalog entries; `moduleLabel` and `moduleHead` show the zero count again.

## D79. A click of a mouse trigger opens the hold menu and leaves it open

**Decision:** on top of D69. When the hold menu's trigger is the middle, back or forward button (`Mouse1`,
`Mouse3`, `Mouse4`) and the button comes back up before the menu opened (180 ms), the menu opens and
stays open (`releaseButton` and `isSticky` in `core/src/hold-menu/hold-gesture.ts`). A click on a sector
or a row runs it, the mouse wheel and the arrows move the selection and Enter runs it; Esc, a click off
the card (which still reaches the terminal) or another click of the trigger closes it, and a key that
writes closes it and reaches the terminal, so nothing is typed under the menu (a modifier alone leaves it
open). The hint bar says so: "Enter or click to run" and "Esc close". Held past the delay, the button
works as before: releasing runs the selected row. A key trigger does not change: a quick tap opens
nothing. A press on the card never takes the focus, so the terminal keeps it when the menu closes.
**Reason:** the maintainer's choice on 2026-11-18, after `libinput debug-events` on his Ubuntu (Wayland,
Logitech receiver) showed `BTN_SIDE` pressed and released 7 to 22 ms apart while the button was held:
many Logitech mice (Signature M650, MX Anywhere 3, models with gestures or side-button scrolling) send
the press and the release together, so the hold cannot be measured and the menu never opened.
**How to revert:** have the controller's `mouseup` call `release()` again and drop `releaseButton`,
`isSticky`, the `click` hint mode in `hold-menu/menu-view.ts` and its two catalog entries
(`menu.hint.pick`, `menu.hint.close`).

## D80. Dragging the edge to 100% goes full height, and leaving full height never stays at 100%

**Decision:** on top of D67. A drag of the bottom edge released at 100% turns full height on, as F11 does,
and saves nothing: the anchored height stays the one from before the drag. Below 100% a drag saves the
height where it is released, as before, and a drag that starts at full height still leaves it at once.
Leaving full height (F11, the double click on the edge, the menu) goes back to the anchored height; when
that height is itself 100%, set in Settings or in the file, it goes to 50% instead and saves it, so the
slider follows. F11 at an anchored height of 100%, which looks like full height, does the same. With the
height pinned by `DCK_HEIGHT` the window still goes to 50% and the file keeps its value. The rule lives in
the dock controller (`toggleFullHeight` returns the height to save, `endResize` returns none at 100%).
**Reason:** reported by the maintainer on 2026-11-18: a drag to 100% saved 100% as the anchored height, so
F11 then switched between two windows of the same size and nothing happened, with no height left to go
back to. The maintainer chose the height from before the drag, and 50% when that one is 100%.
**How to revert:** in `core/src/dock/dock-controller.ts`, have `endResize` return the ratio when kept
whatever it is, have `toggleFullHeight` only flip the flag and return nothing, and drop `leftTo` and
`LEAVE_RATIO`; `main.ts` then saves nothing on F11.

## D81. A file opens through a port that saves only over what was read, and merges a disk change by itself

**Decision:** the model of `plans/files.md` (F1, F2). The core decides a file's kind from what the
`FileStore` port reports (`core/src/files/file-kind.ts`, `file-opener.ts`): an image or a PDF by its
extension, read by nothing but the window through the protocol below; over 50 MB only the card, without a
read; a NUL among the first 8000 bytes (git's probe) a binary, unless a UTF-16 byte order mark starts the
file; anything else text, or Markdown by its extension, read whole. A text over 5 MB, or one that is not
UTF-8 and has no mark, opens read only and is never written back; UTF-8 with or without a mark and UTF-16
with one are written back in the encoding they were read in. The base kept at reading is the text, its
size, its modification time and its SHA-256. Before a save the adapter (`@dck/adapter-node-fs`) reads the
disk again and writes only when it holds the base (same size and hash; a time that moved alone is no
change), else it answers with what the disk holds and the window shows the conflict. The write goes whole
to a hidden temporary file in the same folder, takes the file's mode, is synced and renamed over it; a
link is written through to its file, a file with other hard links is written in place, and a file the user
may not write fails, since a rename only needs the folder's permission. The watcher follows the file's
folder (a writer that renames a new file over it ends a watch on the file itself), waits for 100 ms of
quiet, and reports only a change of content, a deletion or a rename away, and the file coming back; a
truncate then write counts once two reads a pause apart agree. The rules after a change on disk
(`disk-change.ts`): the base again (the cockpit's own save) is ignored; with no edits of the user, or when
the user already typed what the disk holds, reload; with edits and `files.autoMerge` on (the default), a
line based three-way merge in the core (`merge.ts`, a Myers line diff and diff3's grouping) merges when
the disk's and the user's changes touch neither the same nor adjacent lines (as `git merge-file`, and
the same change on both sides is taken once), the disk changed at most 30% of the lines (3 at least), each
side changed at most 2000 inserted plus deleted lines, and the line endings and the encoding stayed; the
merge answers the text, the disk's changes as edits of the user's text and the lines they fill; anything
else is a conflict with its reason (`same-lines`, `many-lines`, `merge-off`, `encoding`, `line-endings`,
`not-text`, `deleted`). `files.autoSave` (on) and `files.autoMerge` (on) are settings in a Files group.
The host channels (`files:open`, `files:save`, `files:watch`, `files:unwatch`, `files:changed`, in
`shell/src/files/files-bridge.ts`) validate every request with zod: any absolute path opens; only a text
opened in this session and not read only saves, and only a file opened in this session is watched. An
opened image or PDF gets an address `dck-file://open/<id>` with a random id; the `dck-file` protocol serves
only those, with their media type and `nosniff`, never another path, a folder or a remote address. A `.env`
opens and saves like any file; no file's content reaches a log, only its path. The recent list per tab keeps
at most 10 paths.
**Reason:** the plan agreed with the maintainer on 2026-11-19. The merge runs in the core rather than
through a library in the window: diff3 over a line diff is about 200 readable lines, the core takes no
package, and it is tested against `git merge-file` on fixtures and on random edits (it never merges what git
does not, and what it merges equals git's text). The cap on edits bounds the diff's work, which grows with
the square of the edits; a few local changes in a 100 000 line file merge in tens of milliseconds, since
the common start and end of each side never enter the diff. The check before a save leaves a few
milliseconds between the read and the rename in which another writer can still slip in, as in git and the
editors; the watcher then shows that write as a change.
**How to revert:** drop `core/src/files`, the `FileStore` port, `packages/adapters/node-fs`,
`shell/src/files`, the `files` channels in `host-api.ts` and `preload.ts`, the protocol in `main.ts`, the
`files` settings with their rows and catalog entries, and the `DCK-FIL-*` codes.


## D82. A file search on Ctrl+Shift+O lists the project's files and keeps the ignored ones apart

**Decision:** F3 of [plans/files.md](../plans/files.md). `Ctrl+Shift+O` (`⌘P` on a Mac) opens a file search
over the tab's folder, the project search's overlay, list and keys in a wider box; the action is
`fileSearch` in `SHORTCUT_IDS`, in the Window group of the Shortcuts page and in the hold menu's Projects
category. Ctrl+P stays with the shell (D13); on a PC the Shortcuts page offers it under the row in one click
("Use Ctrl+P, as in VS Code"), saved like a recorded key, and D69's note then says the terminal no longer
gets it. Inside a repository `git ls-files --cached --recurse-submodules` names the tracked files first (git
takes `--recurse-submodules` only with `--cached` alone, so it is its own call); `--others
--exclude-standard` (the untracked files) and `--others --ignored --exclude-standard --directory
--no-empty-directory` (ignored files one by one, wholly ignored folders closed, `node_modules/` once) follow
in a second request, and the list grows when they arrive. Names stream with a cap (200 000 files, 20 000
ignored) and a time limit (5 s, 3 s). Outside a repository a walk (`@dck/adapter-node-walk`) reads the
first 20 000 entries within 2 s, breadth first, 16 folders at a time, skipping `node_modules`, `.git`,
`dist`, `build`, `target`, `.venv` and `__pycache__` and never entering a link to a folder. Enter on a
closed folder, or typing a path into it, steps in: two levels, 2000 entries, 300 ms, deeper folders closed
again. The ranking is in `core/src/file-search`: project files match fuzzily (letters in order; points
for word starts, camelCase, runs, the file's name, a name that starts with the query and an exact name;
smart case; the shorter path breaks a tie); an ignored file shows only when the query, three characters or
more, a leading dot dropped, appears whole in its name, in a group headed "Ignored by git" after the
project's rows, five rows at most and "N more", which widens. The search key again widens to every listed
ignored file with the fuzzy rule and says so in the header; a query the project does not match does it
by itself. An empty query lists the files the tab picked before, then the project. Each ignored row has an
eye struck through (with its tooltip), a closed folder a chevron. The channels `file-search:list`,
`file-search:others` and `file-search:expand` validate with zod; `others` answers only for a root a listing
named and `expand` only a folder a listing closed, relative and never climbing out. Names only cross the
bridge, never content. Until the file view (F4) exists, a picked file opens in the system's app as a
Ctrl+click on a path does (D40), in one function of `app.ts`.
**Reason:** the plan agreed with the maintainer on 2026-11-19. Measured on Linux under Xvfb: this
repository (761 files) lists in 9 to 15 ms and its untracked and ignored files in 9 to 11 ms; a synthetic
repository of 100 000 tracked files with a 150 000 file ignored `node_modules` lists its tracked files in 82
to 111 ms through the bridge and the rest in 670 to 810 ms, the same as `rg --files` (750 ms) since both walk
the tree, hence the two steps. Ranking 100 000 paths took 5 to 35 ms per key on one thread, over the
8 ms a frame allows, so it runs in a module worker (4 KB) started when the search opens and ended when it
closes, each key ranking only what the previous one matched; the window's thread is busy 0.1 to 0.5 ms per
key and the list redraws 7 to 50 ms after the key on 100 000 files, 1 to 9 ms on this repository. Open, the
search adds about 28 MB to the renderer's working set on 100 000 files and 24 MB on this repository,
most of it the worker itself; closed, the window's heap is back where it was and the worker is gone,
though the process returns the pages to the system only later. The bounded walk reads 20 000 entries in about 320 ms; a step into
`node_modules` 16 to 34 ms.
**How to revert:** drop `core/src/file-search`, `ports/project-files.ts`, `git-files.ts` in node-git,
`packages/adapters/node-walk`, `shell/src/file-search`, the `fileSearch` channels in `host-api.ts` and
`preload.ts`, `ui/src/file-search` and `styles/file-search.css`, the `#files` overlay in `index.html`, the
`fileSearch` action with its keys, Shortcuts row, offer and hold menu item, and the `fileSearch.*`
catalog entries.

## D83. A file opens over its tab as an appendix, in CodeMirror with Lezer's colors, saved by itself

**Decision:** F4a of [plans/files.md](../plans/files.md), the file view's first part.
- **Where:** one file at a time over each tab (`ui/src/files/file-tabs.ts`), above its terminal and review,
  which stay alive and fitted underneath and paint nothing while the file shows (`data-file-shown` hides
  them, so a transparent window never shows the terminal through the text). `openFile(tabId, path, line?)`
  is the only way in: the file search's pick (D82) opens there, and the Ctrl+click on a path and the
  review's button (F5) will. The active tab with a file grows a second segment in one 1px `--line` outline,
  `api │ login.ts`, at the plain tab's height; a 1px divider sits between the segments, hidden beside the
  active one, which takes the selected tab's style; the file segment has a file glyph and the whole path in
  its tooltip. An inactive tab with a file shows the glyph beside its name. In the file's segment a hollow
  ring marks edits not saved yet (from the first key, even while auto save waits) and a filled dot in the
  warning color a conflict with the disk or a deletion, each named by its tooltip ("Changed on disk",
  "Deleted on disk"); a container query on the bar shrinks the name to 120 px, then 64 px below 900 px, then
  hides it below 600 px. A click on a segment switches; the file segment's right click lists the tab's
  recent files and Close file, and Save while it has edits; the tab's right click and the hold menu's Tabs
  list carry Show file or Show terminal. The view's header writes the path from the tab's folder (folders
  muted, the name in the foreground), "Ignored by git" when `git check-ignore` says so (a `GitIgnoreCheck`
  port, node-git, channel `files:ignored`), the note of a read only or colorless file, Find and Go to line
  buttons for the mouse (their keys in the tooltips), and a terminal button with the toggle key in its
  tooltip. The strip under it takes the settings file's strip (D65): its height, its text and its bordered
  buttons.
- **Toggle key:** `toggleFile`, `Ctrl+Shift+Space` on a PC and `⇧⌘Space` on a Mac (⌘Space and ⌥⌘Space are
  Spotlight's, ⌃Space and ⌃⌥Space the input sources', ⌃⌘Space the character viewer; ⇧⌘Space is free in
  macOS's own shortcuts), in the keymap, the Shortcuts page's Files group and every tooltip through
  `data-tip-shortcut`. It does nothing on a tab without a file. Going to the terminal saves first with auto
  save on; a review opened while the file shows sends it behind.
- **Editor:** CodeMirror 6 (`state` 6.7.6, `view` 6.43.15, `commands` 6.11.1, `search` 6.7.2, `language`
  6.13.1, `language-data` 6.5.2, `@lezer/highlight` 1.2.5, `@lezer/common` 1.5.5, pinned), in
  `ui/src/editor`, loaded with a dynamic import on the first text opened: nothing of it is in the page at
  start (a 77 KB chunk and CodeMirror's own, about 290 KB, come with the first file). Text and Markdown
  source open in it; any other kind shows a card with its kind, its size and "Open in the system's app"
  until F4b. Syntax colors come from Lezer's grammars through `@codemirror/language-data`, each language
  loaded on first use, for files up to 2 MB (`FILE_LIMITS.colorBytes`); from 2 to 5 MB the file is editable
  without colors and the header says so; past 5 MB, or not UTF-8, it opens read only with the reason and
  "Open in the system's app". The colors are the palette the maintainer chose, "dck vivo, suave": roles in
  `tokens.json` (`syntax.*`, both themes) mapped to Lezer's tags in `editor-syntax.ts`, brackets colored by
  depth and a doc comment's `@tags`, both from the parse tree of the visible lines, indent guides as 1px
  lines per level for the visible lines, the terminal's font family and size with ligatures on. The
  maintainer took the comments a step lighter in dark (#969696) and darker in light (#5c5c5c) than the mock,
  so every role and the plain text, comments included, reach 4.5:1 on all six grounds of the editor: its
  background, a selection (focused or not, one tint, which a matching bracket shares), a search match, the
  current match, a line from the disk and a removed line (tested in `packages/design`). The editor has no
  active line tint; the active line shows in the gutter. The chrome (gutter, line numbers, cursor,
  selection, matching brackets, search matches, panels) is a CodeMirror theme over the cockpit's tokens:
  matching brackets take the selection's solid tint and search matches two of their own (`searchMatch` under
  every match, the stronger `searchCurrent` under the current one), never an outline, and the line numbers
  keep room for three digits, so the text never moves at line 10 or 100. `.editorconfig` files from the
  file's folder up to one marked `root` (channel `files:editorconfig`, a parser in `core/src/files`) give
  the indentation and the final newline; without one the indentation is guessed from the file. The line
  break is the file's: CRLF stays CRLF, a file that mixes them keeps its carriage returns as characters. The
  cursor blinks with the terminal's timer (D58), never with CodeMirror's animation.
- **Search inside the file:** `@codemirror/search` with a find widget of the cockpit's own controls, a
  drawer that hangs from the header's bottom border at the top right of the editor, left of the scrollbar
  and its match marks (the maintainer's choice on 2026-11-19, over a full-width bar and a floating card):
  no top border, the other sides a 1px `--line` border with bottom radii, the header's border running on
  above it, over the code without pushing it down. CodeMirror reads its height as a scroll margin, so a
  match it steps to never lands under it. Its first row: a chevron for the replace row, the query (24px,
  JetBrains Mono) with the match case, whole word and regular expression toggles inside its right end
  (pressed with an outline too), "3 of 12" counted up to 2000 matches and again 150 ms after typing stops,
  previous, next and close; the second: the replace field under the query, Replace and Replace all as icons.
  A query with no match turns the field's edge to `--critical` and the count says "No results". About
  420px wide, the fields shrink in a narrow editor. Go to line (`Ctrl+G`, `⌃G` on a Mac, where `⌘G` finds
  the next) is the same drawer, shorter, in the same corner (one at a time): a field with "of 245" inside,
  an Enter cap and close; it takes `12`, `12:4`, `12,4` and `:12`, clamps a line past the end to the last,
  and an entry that is not a line turns the edge critical and says "Not a line" inside the field. CodeMirror's
  own go to line dialog is gone. Keys, as VS Code: `Ctrl+F` (`⌘F`), `Enter`/`Shift+Enter` and
  `F3`/`Shift+F3`, `Ctrl+H` (`⌥⌘F`) with the replace row, `Ctrl+Alt+Enter` (`⌥⌘Enter`) replaces all from
  the replace field; a key with its widget open focuses the field and selects its text, and from the text a
  selection on one line becomes the query first; never a toggle: `Esc` closes either and the focus goes back
  to the text. The header's Find and Go to line buttons do what their keys do. Motion (the maintainer's rule,
  2026-11-19): the drawer slides down from under the header's edge over `--motion-fast` with
  `--motion-easing`, transform and opacity only, and a copy of it slides back up when it closes (CodeMirror
  takes the panel out at once); the replace row opens and closes with its height; a key that only refocuses
  an open drawer moves nothing, nothing moves per key typed, the field has the focus from the first frame,
  and with reduced motion it all appears at once. Their words come from the
  catalogs; the editor uses no other CodeMirror surface (no tooltips, completion, lint, fold gutter or
  selection match highlight).
- **Saving and the disk:** `ui/src/files/file-session.ts` keeps the base and runs saves and the disk's
  changes one after the other, so a change that arrives during a save is checked once the save resolves.
  With `files.autoSave` on, a pause of 1 s, going to the terminal, leaving the tab, hiding the window and
  closing the tab save, and `Ctrl+S` saves at any time; off, closing the tab or replacing the file with
  edits asks Save, Don't save or Cancel in a menu with a caption from the tab. A change on disk follows
  D81's rules: no edits, the text reloads in place (only the lines that differ, so the cursor and the scroll
  stay); with edits and `files.autoMerge`, the merge's edits apply by lines outside the undo history and a
  quiet strip says "Merged with a change on disk" with Show (the lines from the disk tinted for 4 s) and
  Undo merge (the user's text back and the conflict strip); otherwise the strip "This file changed on disk",
  with the reason, offers Reload (undoable), Keep mine and Compare, and auto save waits. Compare shows the
  disk's version and the user's side by side, read only, the differing lines tinted; picking hunks from
  three versions is left for F4b. A file deleted on disk gets Save again and Close file; a failed save says
  why with Try again. Every quit from the menus, the tray or the quit card (D75), closing the last window
  (`close-guard.ts`) and the restart after an update (D71; a cancel keeps the update ready) ask the window
  last (`shell/src/quit/quit-files.ts`, channels `quit:settle-files` and `quit:files-settled`): it writes
  the pending saves through the same check within 2 s and lets the app quit; a file left in conflict,
  deleted or not saved shows its strip and keeps the app open until the user decides; with auto save off
  each file with edits asks Save, Don't save or Cancel. While the user is asked the host shows the window
  and waits; a window that does not answer within 2.5 s does not keep the app from quitting. A logout or a
  shutdown quits as before.
- **Recent files:** each tab keeps its last 5 files, the open one included (10 at first; D84), (paths only), offered by the segment's menu and by the
  file search's empty query. With `window.restoreTabs` a saved tab keeps its open file and its recent list;
  on start the file comes back over its tab, hidden, if it still opens, and is read again only when it
  shows.
**Reason:** the plan agreed with the maintainer on 2026-11-19, the measurements of F0
(`plans/files-measurements.md`) and the palette the maintainer picked on 2026-11-19. Measured on Linux under
Xvfb (`scripts/perf/`, 3 runs, `main` against this branch): idle memory 266 MB shown and 255 MB hidden
against 267 and 255, a first prompt 414 ms after spawn against 394 (fastest runs 372 and 392), the terminal
echoing a key at 4.9 ms median and 11.1 ms p95 against 4.5 and 11.7, all within the machine's noise. In the
editor: a 1 MB TypeScript file shows, colored, 80 ms after Enter in the file search on the first open (the
editor's code and the grammar loaded on the way) and 22 ms on the next, a key echoes at 9.1 ms median and
13.3 ms p95 in its middle (120 keys typed through X), and the first open adds 28 MB of PSS. Lezer's coloring
matches the maintainer's mock on its snippet but for three tokens: a name used as a value (`Warning` in
`Warning.SenderUnavailable`) is a variable and its member a property, where the mock shows a type;
`undefined` is a variable, not a constant; a type annotation's colon is punctuation, not an operator.
JavaScript's grammar tags a method's name where it is declared as a property, so `editor-syntax.ts` retags
it as a function, as the mock and a call show it.
**How to revert:** drop `ui/src/files`, `ui/src/editor`, `tabs/file-segment.ts` and the appendix in
`tab-bar.ts`, `styles/file-tab.css`, `file-view.css` and `editor.css`, the `toggleFile` action with its keys
and Shortcuts row, the file view's wiring in `app.ts` (the pick of the file search goes back to the system's
app), the `syntax` tokens with their checks, `editorconfig.ts` and `line-edits.ts` in the core, the
`files:editorconfig` and `files:ignored` channels with the `GitIgnoreCheck` port and `git-ignore.ts`, the
`file` and `recent` fields of a saved tab, `shell/src/quit/quit-files.ts` with the `quit:settle-files` and
`quit:files-settled` channels, the `files.*` catalog entries and the CodeMirror packages, and give the last
window's close and the update's restart their direct quit again.

## D84. A file path opens in the cockpit at its line, from the terminal and from the review

**Decision:** F5 of [plans/files.md](../plans/files.md), the ways into the file view (D83), and the
maintainer's changes to F4a asked on the way.
- **Ctrl+click on a path (amends D40):** a file path Ctrl+clicked (`⌘` on a Mac) in a terminal opens through
  `openFile(tabId, path, line, column)` over the tab where the click happened, the cursor at the place the
  line names and scrolled to the middle; a file the view cannot show (binary, too large) opens its card, which
  offers the system's app. The places read (`ui/src/terminal/path-candidates.ts`): `a.ts:12` and
  `a.ts:12:5` (gcc, clang, go, rustc, tsc `--pretty`, vitest, jest, pytest, a stack trace), `a.ts(12,5)` and
  `a.ts(12)` (tsc, MSBuild), Python's `File "a.py", line 12` and ESLint's compact `a.ts: line 12, col 5`; a
  line or column of 0 is ignored. A drive letter starts a path (`C:\src\a.ts:3`, `D:/x/a.ts`), only at the start
  of a word, so `PATH=/a:/b` still splits; a folder written whole in parentheses or brackets
  (`app/(auth)/[id]/page.tsx`) stays in the path, any other bracket ends it, so `Update(src/x.ts)` still finds
  `src/x.ts`; a quoted text with a space in it is one candidate (`"/home/ana/my project/a.py"`), and an
  apostrophe that opens nothing path-like is passed over. Relative paths resolve against the tab's folder
  and a path that does not exist is no link, as in D40. A folder keeps its menu and an address its browser.
- **Ctrl+Shift+click** opens a file the other way: in the system's app while files open in the cockpit, in
  the cockpit while the setting below sends them to the app. Cheap (xterm hands the click's Shift over) and
  the old behavior stays one key away. The tooltip draws both held clicks, each on its own line ("Open",
  then "Open in the system's app" or "Open in the cockpit"), through a second gesture in the design system's
  tooltip (`data-tip-alt-key` and `data-tip-alt-gesture` on an element, `alternate` on a region), and names
  the path from the project with its place, `acme-api/src/app.ts:12:5`. A folder shows one click.
- **Setting:** `files.openPathsInCockpit`, on by default, with its row in the Files group: off, the plain
  click goes to the system's app as before and Ctrl+Shift+click to the cockpit. Kept because it is one
  boolean and one branch (`pathRoute`), and someone who edits in another editor keeps D40's habit.
- **From the review:** each file's header has an Open file button (the file glyph, `Open file` and `o` in
  its tooltip) between the counts and Viewed, and `o` does the same for the file under the cursor in the
  diff or the one picked in the index; the review's key hints list it. It opens the whole file over the
  review's tab, switching the tab to the file, at the line under the diff's cursor when the cursor is on that
  file (a removed line opens where it was), else at its first changed line on screen below the pinned
  header, else at its first change (`lineToOpen` in `core/src/diff/change-rows.ts`). `o` was free (the review
  has `n p [ ] v c`, Enter, `Ctrl+R`, `Ctrl+Shift+Enter`) and reads as open; `e` would have suggested
  editing in place. A deleted file and a submodule's pointer get no button and `o` does nothing on them; a
  file inside a submodule opens by its real path, the review's root and its path from the top. Ctrl+click on
  a header's path now opens as a path in the terminal does, with the same two clicks in its tooltip.
- **A file's path from its project:** the file segment's tooltip, the file view's header, the terminal's
  path tooltip and the recent list write a path from the outermost repository of the tab's folder, its
  name first (`notifica-compose/.claude/commands/notifica-docs.md`), so a file in a submodule keeps the
  submodule's folder; under the home it starts with `~`, anywhere else it is whole (`shortPath` in
  `core/src/files/short-path.ts`, Windows separators kept and case ignored). The host answers the
  repository through `review:root` (`DiffSource.root`), which follows `--show-superproject-working-tree` up;
  the window asks once per folder and draws the tabs again when it answers.
- **Tooltips:** a path tooltip (`data-tip-path`) breaks only after a separator (a `<wbr>` after each, each
  name kept whole, a hyphen in it too), within the design system's maximum width; only a name longer than
  a line (48 characters) is cut where the line ends. The keys beside any tooltip's text follow a space
  that collapses when they wrap, instead of an 8px left margin, so a keys row of its own starts at the
  text's left edge; this was the shared tooltip's (`kit/tooltip.ts`), fixed there for every tooltip.
- **Tab menus in a short window:** the shared menu (`tabs/tab-menu.ts`: the tab's right click, the file
  segment's, the folder's, the update notice's) opens on the side asked, else on the other, and when it fits
  neither it takes the window's height with a 4px margin and its list scrolls with the design system's
  scrollbar, the arrows scrolling each item into view; the caption and a footer of actions stay in view.
  The all-tabs list is its own component and already scrolled.
- **Recent files:** 5 per tab counting the open one, so the segment's menu lists up to 4 others (a saved
  list of 10 keeps its newest 5); Save and Close file sit under a divider as the menu's footer; two files of
  one name show, muted beside the name, the fewest folders of their short path that tell them apart
  (`api` and `web`, `.vscode` and `User`), as the file search writes a row's folder.
**Reason:** F5 as agreed with the maintainer on 2026-11-19, and the maintainer's requests of the same day on
the menu clipped in a 600px window, the recent list, the long absolute path in the segment's tooltip and its
indented keys.
**How to revert:** give `PathLinkOptions.openFile` back to `api.paths.openFile` in the terminal session and
drop `path-open.ts`, the places in `path-candidates.ts`, `files.openPathsInCockpit` with its row and texts,
the column of `openFile` and `goToLine`, `alternateLabel` in the keymap and the tooltip's second gesture;
drop the review's Open file button, `o`, `openingLine` and `lineToOpen`; write the segment's tooltip and
the header from the absolute path and the tab's folder again and drop `shortPath`, `recentEntries` and the
`review:root` channel; set `MAX_RECENT_FILES` back to 10 and put the menu's footer back in its list.

## D85. A file shows as what it is: an image, an SVG, a Markdown preview or a PDF, and Compare picks per conflict

**Decision:** F4b of [plans/files.md](../plans/files.md), the file view's second part, as the maintainer
decided from F0 on 2026-11-19. `load` in `ui/src/files/file-tabs.ts` gives each kind its view; the views live
in `ui/src/viewers`, the Markdown and SVG modes in `ui/src/files/file-modes.ts`.
- **Images** (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO): the header reads the size from an `<img>` that is never
  drawn; past 50 megapixels (`FILE_LIMITS.imagePixels`) the card shows with the size. Otherwise the bytes
  come over `files:bytes` (only an image opened in this session, zod at the bridge) and WebCodecs'
  `ImageDecoder` decodes the first frame at most 2048 px on the long side (`FILE_LIMITS.imageSide`, a smaller
  scale for a JPEG, which then never decodes whole), into an `ImageBitmap` drawn on a canvas the size of the
  view; a Blob decode is the fallback for a type WebCodecs does not take. Neither an `<img>` decode nor its
  pixels stay: the bitmap is closed and `webFrame.clearCache()` runs when the file closes. Fit is the default
  (a small image stays at 100%); the font keys zoom while an image shows (`Ctrl` + `=` `-` `0`, `⌘` on a
  Mac, with their tooltips from the keymap), and the image itself takes `+` `-` `0` `1` (actual size) and the
  arrows; Ctrl and the wheel zoom at the pointer, a drag or the wheel pans an image larger than the view. The
  header shows −, the percentage, +, Fit and Actual size (pressed with a ring), the pixel size and the file
  size. Transparency sits on a checkerboard of `--surface` and `--line`. An animated GIF, APNG, WebP or AVIF
  (`core/src/files/image-head.ts` reads the first 8000 bytes) shows its first frame; the header says so and
  offers "Open in the system's app" to see it play. Pixel art zoomed in keeps square pixels.
- **SVG:** opens as its image, drawn from its `<img>` (never inline in the page, so its scripts never run) at
  2048 px on the long side; `dck-file:` serves an image with `content-security-policy: default-src 'none';
  style-src 'unsafe-inline'; sandbox`, so an SVG framed by mistake runs nothing either. The header's Code
  button and `Ctrl+Shift+J` (`⇧⌘J`, the new action `filePreview`, in the Shortcuts page's Files group) switch
  to the source in the editor and back; the image is drawn again after each save or reload.
- **Markdown:** opens in the editor, whose fenced code blocks now take their language's colors (Markdown
  loaded with `codeLanguages`). Edit, Preview and Side by side in the header (side by side only when the
  window is wider than 900 px; narrower, the editor stays alone); `Ctrl+Shift+J` switches between Edit and
  Preview, keeping the nearest top level heading in view both ways (`core/src/files/markdown-headings.ts`).
  `marked` 18.2.1 (GFM) and `dompurify` 3.4.18, pinned, load with the first preview. DOMPurify keeps the
  html profile without styles, forms, frames, plugins, media, SVG or MathML; an image's address waits in a
  data attribute until checked. Links (`core/src/files/markdown-links.ts`): http and https open in the
  system's browser through `external.openLink` (D40), a relative or absolute path opens that file in the
  cockpit (GitHub's `#L12` at its line), `#anchor` scrolls to the heading with GitHub's slug, anything else
  does nothing. Images: under the Markdown file's folder they come through `dck-file:` (channel
  `files:assets`: only for a Markdown file opened in this session, only image kinds, only paths inside its
  folder after links are followed, ids revoked by `files:release` when the file closes); `data:` images
  show; https images wait behind a placeholder with their address and "Load remote images", which loads
  them for that file while it stays open; http and other schemes show nothing. Past 200 KB
  (`FILE_LIMITS.previewBytes`) the header says "Preview up to 200 KB" and the editor stays alone. The
  preview uses Inter, the editor's font for code and the editor's Lezer colors for code blocks, on
  `--surface` (contrast checked for every syntax role there); each top level block has
  `content-visibility: auto`.
- **PDF:** Chromium's viewer (`plugins: true`, the only plugin Electron 45 has) in an `iframe` from
  `dck-file:`. A link in the PDF asks the browser side to take the whole window: `will-frame-navigate`
  (`shell/src/files/frame-guard.ts`) refuses it and opens an http or https address in the system's browser
  when a PDF shows; a frame may only hold an opened PDF, the viewer's extension or `about:blank`, and never
  goes elsewhere. The viewer's download saves only a `dck-file:` address, through the system's dialog with
  the file's name (`will-download`); its print button opens the system's print dialog.
- **Compare** on a conflict is a three-way picker (`viewers/merge-picker.ts`) over `mergeRegions` in
  `core/src/files/merge.ts` (git's grouping, as the merge by itself, with no cap on how much the disk
  changed; past 20 000 changed lines the file is one conflict): merged stretches are in place, folded to 3
  lines around a conflict; each conflict shows the user's lines (`--diff-add`) and the disk's
  (`--diff-remove`) with Use mine, Use disk and Use both (the user's first, as git's union); the choice shows
  as a pressed button, its words and a bar at the kept side. Keys: `n` and `p` (or `F7`, `Shift+F7`) step
  between conflicts, `m`, `d` and `b` choose and move on, `Ctrl+Enter` (`⌘Enter`) is Done, `Esc` Cancel, all
  in the tooltips. Done puts the text in the editor as one step Ctrl+Z takes back and settles the conflict
  (the base becomes the disk's, auto save writes it); Cancel goes back to the strip. The two read only
  columns of D83 are gone.
- **The rest** (binary, past 50 MB) keeps the card.
- **Page policy** (`packages/ui/index.html`): `img-src 'self' data: dck-file: https:`, `frame-src
  dck-file:`, `object-src 'none'`; `default-src 'self'` covers the rest, so scripts and fetches stay as
  they were. `https:` in `img-src` is for the remote images the user asks for in a preview.
**Reason:** the plan and the maintainer's choices of 2026-11-19, and F0's measurements
([files-measurements.md](../plans/files-measurements.md) on the spike branch). Measured on Linux under Xvfb
with `scripts/perf/viewers.cjs` (each viewer in a launch of its own, median of 3 runs, PSS of every process
against the moment before the file opened):

| Viewer | first paint (ms) | PSS shown (MB) | peak (MB) | after it closed (MB), of it the renderer | F0's row |
| --- | --- | --- | --- | --- | --- |
| PNG 4000x3000, 21 MB | 500 | 156 | 205 | 101, renderer 17 | bitmap 2048: 345 ms, 51, 103, 25 |
| JPEG 3600x2400, 2.4 MB | 195 | 34 | 37 | 12, renderer -2 | 6000x4000 bitmap: 302 ms, 57, 154, 33 |
| SVG, 480x320 | 93 | 21 | 21 | 3, renderer -2 | |
| README 100 KB, preview | 133 | 31 | 33 | 17, renderer 9 | marked: 105 ms, 15 shown |
| PDF 50 pages, 3 MB | 97 (frame loaded) | 93 | 93 | 21, renderer -5 | dck-file frame: 122 ms, 97, 27 |

What stays in the renderer after an image closes is 17 MB for the PNG and nothing for the JPEG and the SVG;
the rest of the "after" column is the main process, which read the file to send it and frees the buffers at
its next collection (24 MB after the PNG in one run, 84 in two). The first version, an `<img>` decode, kept
89 MB in the renderer after the PNG closed, and a Blob decode copied the file into the browser process
first. A JPEG decodes at a smaller scale, so its peak stays near what shows; a PNG has no scaled decode, so
its peak is F0's (about 1.6 times the full image), and the PNG shows at 500 ms against F0's 345 because
its 21 MB cross from the main process first. The PDF viewer's
three processes start with the frame and end with it. With no file open nothing measurable changed
(`scripts/perf/measure.cjs`, probe and idle, 3 runs, `main` against this branch): idle memory 266 MB shown
and 253 MB hidden against 265 and 253, the renderer 67 MB against 66, a first prompt 445 ms after spawn
against 432 (main's runs 384 to 436, this branch's 445 to 446, the main process reaching the cockpit's code
19 ms later before any of it runs), a key echoed at 4.9 ms median and 9.9 ms p95 against 4.6 and 10.0. The
page's first bundle grows by 25 KB (the viewers and Compare); marked and DOMPurify load with the first
preview. `plugins: true` adds nothing while no PDF shows (F0, and the idle rows above); it lets any frame of the
page show a PDF from a source the policy allows, so `frame-src` names `dck-file:` only, `object-src` is
`'none'` and the guard above keeps the viewer from navigating; PDFium runs in sandboxed renderers of its own.
The protocol's new rule serves a Markdown file's images only while it is open and only from its folder,
links resolved, as the plan asked.
**How to revert:** drop `ui/src/viewers`, `ui/src/files/file-modes.ts`, `editor/code-highlight.ts`,
`styles/viewers.css` and `markdown.css`, `image-head.ts`, `markdown-links.ts` and `markdown-headings.ts` and
`mergeRegions` in the core, `frame-guard.ts` with its handlers and `plugins: true` in `main.ts`, the
`files:assets`, `files:release` and `files:bytes` channels, the SVG address and the image policy in the
protocol, the `filePreview` action, the `files.image.*`, `files.markdown.*`, `files.svg.*`,
`files.pdf.*` and `files.merge.*` entries, `marked`, `dompurify` and `@codemirror/lang-markdown`, the page
policy's new sources, and give `load` its card for every kind but text again.

## D86. Hairlines are borders of one token, and the bars and the side by side headers sit on whole device pixels

**Decision:** every 1px line in the line color is a border of `--size-hairline` (1px), never a filled box,
a box shadow or a box moved by a half translate: Chromium snaps a border to whole device pixels (one at
125% and 150%, two at 200%) wherever it lands, while a 1px box took two pixels at 150% (the pane divider)
and a translate of -50% spread the hold menu hint's side lines over two. The tab bar is `--size-bar` (44px)
and the headers that sit side by side, the panel's path, the file view's and the review's, are
`--size-header` (36px), each with its divider inside (`box-sizing: border-box`); both are steps of 4, whole
device pixels at 100%, 125%, 150%, 175% and 200%, so the lines below the bar land on a pixel at full
height and the three header lines meet in one. The panel header draws its own divider and the first
section drops its line. The panel's mono path and the file view's Inter path keep their fonts; both are
trimmed to their x-height (`text-box: trim-both ex alphabetic`) and centered, which puts their baselines
within half a device pixel at every scale (their x-heights are 6.5px and 6.6px). The dock controller
takes, for an anchored or dragged height, the nearest height in DIPs that is a whole number of device
pixels at the display's scale (`deviceHeight`, within 4 DIPs, never past the work area; the whole work
area is kept as it is): at 125% a window of 557 DIPs is 696.25 pixels, and a compositor that fits the
window's 697 rows into that box spreads the lines near the bottom over two rows. `styles/hairlines.test.ts`
keeps the rules.
**Reason:** reported by the maintainer on 2026-11-19 on Ubuntu at a fractional scale: the lines were not
the same thickness and changed with the window's height, and the panel's header and the file view's did
not meet. Measured in the real app at scales 1, 1.25, 1.5 and 2 and six heights (`plans/hairlines.md`).
**How to revert:** drop `deviceHeight` and the `scaleFactor` of `Display` from the dock controller and the
screen port, the `hairline`, `bar` and `header` size tokens and their uses in `ui/src/styles`, the panel
header's divider and `text-box` trims, and `styles/hairlines.test.ts`.
