import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const repositoryRoot = join(import.meta.dirname, '..', '..', '..')
const pluginRoot = join(repositoryRoot, 'integrations', 'claude-code')

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(pluginRoot, path)]
  })
}

const signalCommand =
  /^\[ -n "\$DCK_PTY_ID" \] && command -v dck >\/dev\/null 2>&1 && dck agent signal ([a-z-]+) \|\| true$/

const hooksFileSchema = z.strictObject({
  hooks: z.record(
    z.string(),
    z.array(
      z.strictObject({
        matcher: z.string().optional(),
        hooks: z.array(
          z.strictObject({
            type: z.literal('command'),
            command: z.string().regex(signalCommand),
            async: z.literal(true),
          }),
        ),
      }),
    ),
  ),
})

const pluginManifestSchema = z.object({ name: z.string(), description: z.string() })

const marketplaceSchema = z.object({
  name: z.string(),
  owner: z.object({ name: z.string().min(1) }),
  plugins: z.array(z.object({ name: z.string(), source: z.string().startsWith('./') })),
})

describe('Claude Code plugin', () => {
  it('should map each hook to its attention state when reading hooks.json', () => {
    const file = hooksFileSchema.parse(readJson(join(pluginRoot, 'hooks', 'hooks.json')))

    const mapping = Object.entries(file.hooks).flatMap(([event, groups]) =>
      groups.flatMap((group) =>
        group.hooks.map((hook) => ({
          event,
          matcher: group.matcher ?? '*',
          state: hook.command.match(signalCommand)?.[1],
        })),
      ),
    )

    expect(mapping).toEqual([
      { event: 'UserPromptSubmit', matcher: '*', state: 'working' },
      { event: 'PostToolUse', matcher: '*', state: 'working' },
      { event: 'PermissionRequest', matcher: '*', state: 'needs-you' },
      {
        event: 'Notification',
        matcher: 'permission_prompt|elicitation_dialog',
        state: 'needs-you',
      },
      { event: 'Notification', matcher: 'idle_prompt', state: 'your-turn' },
      { event: 'Stop', matcher: '*', state: 'your-turn' },
      { event: 'SessionEnd', matcher: '*', state: 'ended' },
    ])
  })

  it('should list the plugin under its own name when reading the marketplace manifest', () => {
    const marketplace = marketplaceSchema.parse(
      readJson(join(repositoryRoot, '.claude-plugin', 'marketplace.json')),
    )
    const plugin = pluginManifestSchema.parse(
      readJson(join(pluginRoot, '.claude-plugin', 'plugin.json')),
    )

    const entries = marketplace.plugins.map((entry) => ({
      name: entry.name,
      path: join(repositoryRoot, entry.source),
    }))

    expect(marketplace.name).toBe('dev-cockpit')
    expect(entries).toEqual([{ name: plugin.name, path: pluginRoot }])
    expect(plugin.name).toBe('dck')
  })

  it('should hold only the manifest and the hooks when listing the plugin files', () => {
    const files = filesUnder(pluginRoot).map((path) => path.split(/[\\/]/).join('/'))

    expect(files.sort()).toEqual(['.claude-plugin/plugin.json', 'hooks/hooks.json'])
  })
})
