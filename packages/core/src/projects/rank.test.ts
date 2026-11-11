import { describe, expect, it } from 'vitest'
import type { Project } from '../ports/projects.ts'
import { rankProjects } from './rank.ts'

const project = (name: string, activity?: number): Project => ({
  name,
  path: `/p/${name}`,
  ...(activity === undefined ? {} : { activity }),
})

const names = (projects: readonly Project[]) => projects.map((entry) => entry.name)

describe('rankProjects', () => {
  it('should put the recently opened projects first in the order of use when ranking', () => {
    const projects = [project('a'), project('b'), project('c')]

    expect(names(rankProjects(projects, ['/p/c', '/p/a']))).toEqual(['c', 'a', 'b'])
  })

  it('should order the never opened projects by repository activity when ranking', () => {
    const projects = [project('old', 1), project('new', 9), project('mid', 5)]

    expect(names(rankProjects(projects, []))).toEqual(['new', 'mid', 'old'])
  })

  it('should break ties by name when there is no activity', () => {
    const projects = [project('b'), project('a')]

    expect(names(rankProjects(projects, []))).toEqual(['a', 'b'])
  })

  it('should ignore recent paths that no longer exist when ranking', () => {
    const projects = [project('a')]

    expect(names(rankProjects(projects, ['/p/gone', '/p/a']))).toEqual(['a'])
  })

  it('should list an opened project once when it is also the most active', () => {
    const projects = [project('a', 9), project('b', 1)]

    expect(names(rankProjects(projects, ['/p/b']))).toEqual(['b', 'a'])
  })
})
