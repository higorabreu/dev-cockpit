export interface Clock {
  now(): number
}

export type Cancel = () => void

export interface Scheduler {
  after(milliseconds: number, task: () => void): Cancel
}
