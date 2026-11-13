import { describe, expect, it } from 'vitest'
import type { CommandRunner } from './command-runner.ts'
import { createProcessScanner } from './process-scanner.ts'

const script = '/Applications/Dev Cockpit.app/Contents/Resources/app/daemon.cjs'
const electron = '/Applications/Dev Cockpit.app/Contents/MacOS/Dev Cockpit'
const listingCommand = 'ps -xww -o pid=,command='

const fakeRun =
  (outputs: Record<string, string>): CommandRunner =>
  async (command, args) =>
    outputs[[command, ...args].join(' ')]

const listing = [
  `  210 ${electron} ${script}`,
  `  211 ${electron} ${script}`,
  '  212 /bin/zsh -l',
  `  213 ${electron}`,
  `  214 vim ${script}.orig`,
  `  215 ${electron} ${script} DCK_ENDPOINT=/tmp/dck-dev/daemon.sock`,
  '',
].join('\n')

// As `ps -E -ww -o command=` prints it: the command, then the environment
const environment = (pid: number, command: string, env: string) => ({
  [`ps -E -ww -o command= -p ${pid}`]: `${command} HOME=/Users/ana ${env}\n`,
})
const daemon = `${electron} ${script}`

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
        [listingCommand]: listing,
        ...environment(210, daemon, ''),
        ...environment(211, daemon, 'DCK_ENDPOINT=/tmp/dck-dev/daemon.sock'),
      })

      const found = await createProcessScanner(run).find({ argument: script, endpoint })

      expect(found).toEqual(expected)
    },
  )

  it('should leave out the excluded process when it runs the script too', async () => {
    const run = fakeRun({
      [listingCommand]: listing,
      ...environment(210, daemon, ''),
      ...environment(211, daemon, ''),
    })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: undefined,
      exclude: 210,
    })

    expect(found).toEqual([211])
  })

  it('should read the endpoint from the environment when an argument names one too', async () => {
    const planted = `${daemon} DCK_ENDPOINT=/tmp/dck-dev/daemon.sock`
    const run = fakeRun({ [listingCommand]: listing, ...environment(215, planted, '') })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: '/tmp/dck-dev/daemon.sock',
    })

    expect(found).toEqual([])
  })

  it('should take the last DCK_ENDPOINT when the environment holds it twice', async () => {
    const run = fakeRun({
      [listingCommand]: `  211 ${daemon}\n`,
      ...environment(211, daemon, 'DCK_ENDPOINT=/tmp/a.sock DCK_ENDPOINT=/tmp/b.sock'),
    })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: '/tmp/b.sock',
    })

    expect(found).toEqual([211])
  })

  it.each([
    { when: 'it is the last variable', env: 'DCK_ENDPOINT=/Users/ana/my dck/daemon.sock' },
    {
      when: 'another variable follows it',
      env: 'DCK_ENDPOINT=/Users/ana/my dck/daemon.sock TERM=xterm-256color',
    },
  ])('should find the process when the endpoint has spaces and $when', async ({ env }) => {
    const run = fakeRun({ [listingCommand]: `  211 ${daemon}\n`, ...environment(211, daemon, env) })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: '/Users/ana/my dck/daemon.sock',
    })

    expect(found).toEqual([211])
  })

  it.each([
    { when: 'only starts the same way', env: 'DCK_ENDPOINT=/Users/ana/my dck/daemon.sock.old' },
    { when: 'is missing', env: '' },
  ])('should skip the process when its endpoint $when', async ({ env }) => {
    const run = fakeRun({ [listingCommand]: `  211 ${daemon}\n`, ...environment(211, daemon, env) })

    const found = await createProcessScanner(run).find({
      argument: script,
      endpoint: '/Users/ana/my dck/daemon.sock',
    })

    expect(found).toEqual([])
  })

  it('should skip the process when the pid runs something else by the second ps', async () => {
    const run = fakeRun({
      [listingCommand]: `  210 ${daemon}\n`,
      ...environment(210, '/bin/zsh -l', ''),
    })

    const found = await createProcessScanner(run).find({ argument: script, endpoint: undefined })

    expect(found).toEqual([])
  })

  it('should not match the script when it is only part of an argument', async () => {
    const run = fakeRun({
      [listingCommand]: `  214 vim ${script}.orig\n`,
      ...environment(214, `vim ${script}.orig`, ''),
    })

    const found = await createProcessScanner(run).find({ argument: script, endpoint: undefined })

    expect(found).toEqual([])
  })

  it('should find nothing when the process listing fails', async () => {
    const found = await createProcessScanner(fakeRun({})).find({
      argument: script,
      endpoint: undefined,
    })

    expect(found).toEqual([])
  })
})
