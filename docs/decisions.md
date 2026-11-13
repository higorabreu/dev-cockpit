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
Ctrl+Shift+B panel, Ctrl+Shift+O projects) and agent flow (Ctrl+Shift+D diff, Ctrl+Shift+J next waiting
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
**Out of this round:** remapping the other shortcuts (the screen only lists them), Jira and GitLab
connections and choosing what the panel shows.
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

## D41. macOS: a panel window, F12 on every platform and the Keychain through `security -i`

**Decision:** the MAC-T1 spike settles the macOS design of [plans/macos.md](../plans/macos.md). The window is
an Electron `type: 'panel'` at the `screen-saver` level, visible on all workspaces and over fullscreen, with
no Dock icon, focused on show with `focus()` and `app.focus({ steal: true })`. The default key stays `F12` on
every platform, so there is no per-platform default; on a Mac keyboard it is `fn+F12`. The Keychain is
reached through `security -i` with the command on stdin, and a value with a line break is refused, since
`security` has no escape for it. Process inspection uses `ps` (`tpgid`, `comm`, `lstart`) and
`lsof -a -d cwd -Fn`. Tested on macOS 26.5.1 arm64 with Electron 45.3.0: the panel showed over a fullscreen
app and on another desktop and received the keyboard without a click; F12, `Ctrl+Backtick` and
`Option+Space` fired with no Accessibility permission; `node-pty` opened `zsh -il`; `lsof` took about 20 ms.
**Reason:** the spike on a tester's Mac on 2026-11-13; F12 keeps one key across platforms and was the
tester's choice.
**How to revert:** the plan B of the plan's risks (a regular high-level window with the Dock hidden), or a
per-platform default key passed in by the host.
