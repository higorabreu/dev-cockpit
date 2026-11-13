import { describe, expect, it } from 'vitest'
import type { CommandRunner } from './command-runner.ts'
import { createProcessScanner } from './process-scanner.ts'

const script = '/Applications/Dev Cockpit.app/Contents/Resources/app/daemon.cjs'
const electron = '/Applications/Dev Cockpit.app/Contents/MacOS/Dev Cockpit'

const fakeRun =
  (outputs: Record<string, string>): CommandRunner =>
  async (command, args) =>
    outputs[[command, ...args].join(' ')]

const listing = [
  `  210 ${electron} ${script}`,
  `  211 ${electron} ${script}`,
  '  212 /bin/zsh -l',
  `  213 ${electron}`,
  '',
].join('\n')

const environment = (pid: number, env: string) => ({
  [`ps eww -o command= -p ${pid}`]: `${electron} ${script} HOME=/Users/ana ${env}\n`,
})

describe('createProcessScanner', () => {
  it.each([
    { when: 'the query asks for the default endpoint', endpoint: undefined, expected: [210] },
    {
      when: 'the query asks for another endpoint',
      endpoint: '/tmp/dck-dev/daemon.sock',
      expected: [211],
    },
  ])(
    'should find only the processes on that endpoint when $when',
    async ({ endpoint, expected }) => {
      const run = fakeRun({
        'ps -axo pid=,command=': listing,
        ...environment(210, ''),
        ...environment(211, 'DCK_ENDPOINT=/tmp/dck-dev/daemon.sock'),
      })

      const found = await createProcessScanner(run).find({ argument: script, endpoint })

      expect(found).toEqual(expected)
    },
  )

  it('should leave out the excluded process when it runs the script too', async () => {
    const run = fakeRun({
      'ps -axo pid=,command=': listing,
      ...environment(210, ''),
      ...environment(211, ''),
    })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: undefined,
      exclude: 210,
    })

    expect(found).toEqual([211])
  })

  it('should find nothing when the process listing fails', async () => {
    const found = await createProcessScanner(fakeRun({})).find({
      argument: script,
      endpoint: undefined,
    })

    expect(found).toEqual([])
  })
})
