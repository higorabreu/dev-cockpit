import { describe, expect, it } from 'vitest'
import { parseComposePs, uptimeParts } from './compose.ts'

const line = (fields: Record<string, string>) => JSON.stringify(fields)

describe('parseComposePs', () => {
  it('should read one container per line when the output is ndjson', () => {
    const output = [
      line({
        Service: 'nginx',
        Name: 'nginx_shop',
        State: 'running',
        Health: '',
        Status: 'Up 17 hours',
      }),
      line({
        Service: 'backend',
        Name: 'backend',
        State: 'running',
        Health: 'healthy',
        Status: 'Up 17 hours (healthy)',
      }),
    ].join('\n')

    const containers = parseComposePs(output)

    expect(containers.map((c) => c.service)).toEqual(['backend', 'nginx'])
    expect(containers[0]).toMatchObject({
      state: 'running',
      health: 'healthy',
      status: 'Up 17 hours (healthy)',
    })
    expect(containers[1]).toMatchObject({ name: 'nginx_shop', health: undefined })
  })

  it('should read a list when an older compose prints a json array', () => {
    const output = JSON.stringify([
      { Service: 'redis', Name: 'r', State: 'running', Health: '', Status: 'Up 1 hour' },
    ])

    expect(parseComposePs(output)).toHaveLength(1)
  })

  it('should map exited and dead containers to stopped when reading states', () => {
    const output = [
      line({ Service: 'a', State: 'exited' }),
      line({ Service: 'b', State: 'dead' }),
    ].join('\n')

    expect(parseComposePs(output).map((c) => c.state)).toEqual(['stopped', 'stopped'])
  })

  it('should map a running container still starting its health check to starting', () => {
    const output = line({ Service: 'a', State: 'running', Health: 'starting' })

    expect(parseComposePs(output)[0]?.state).toBe('starting')
  })

  it('should map restarting and created containers to starting when reading states', () => {
    const output = [
      line({ Service: 'a', State: 'restarting' }),
      line({ Service: 'b', State: 'created' }),
    ].join('\n')

    expect(parseComposePs(output).map((c) => c.state)).toEqual(['starting', 'starting'])
  })

  it('should keep paused containers as paused when reading states', () => {
    expect(parseComposePs(line({ Service: 'a', State: 'paused' }))[0]?.state).toBe('paused')
  })

  it('should flag an unhealthy container when the health check fails', () => {
    const output = line({ Service: 'a', State: 'running', Health: 'unhealthy' })

    expect(parseComposePs(output)[0]).toMatchObject({ state: 'running', health: 'unhealthy' })
  })

  it('should skip lines that are not json and entries without a name when parsing', () => {
    const output = [
      'warning: something',
      line({ Service: 'ok', State: 'running' }),
      line({ State: 'running' }),
    ].join('\n')

    expect(parseComposePs(output).map((c) => c.service)).toEqual(['ok'])
  })

  it('should return nothing when the output is empty', () => {
    expect(parseComposePs('')).toEqual([])
  })
})

describe('uptimeParts', () => {
  it('should read the number and unit when the status says how long it is up', () => {
    expect(uptimeParts('Up 17 hours (healthy)')).toEqual({ unit: 'h', value: 17 })
    expect(uptimeParts('Up 3 days')).toEqual({ unit: 'd', value: 3 })
    expect(uptimeParts('Up 2 weeks')).toEqual({ unit: 'w', value: 2 })
  })

  it('should read one unit when docker says about an hour or less than a second', () => {
    expect(uptimeParts('Up About an hour')).toEqual({ unit: 'h', value: 1 })
    expect(uptimeParts('Up Less than a second')).toEqual({ unit: 's', value: 1 })
  })

  it('should be undefined when the container is not up', () => {
    expect(uptimeParts('Exited (1) 12 minutes ago')).toBeUndefined()
    expect(uptimeParts('')).toBeUndefined()
  })
})
