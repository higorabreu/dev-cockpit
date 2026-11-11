import type {
  Cancel,
  Clipboard,
  Clock,
  Display,
  DockWindow,
  Point,
  PtyExit,
  PtyHost,
  PtyOptions,
  PtySession,
  Rectangle,
  Scheduler,
  Screen,
  SecretStore,
} from '../ports/index.ts'

export class FakeClock implements Clock {
  constructor(public time = 0) {}
  now() {
    return this.time
  }
}

export class FakeScheduler implements Scheduler {
  private time = 0
  private tasks: { at: number; task: () => void; cancelled: boolean }[] = []

  after(milliseconds: number, task: () => void): Cancel {
    const entry = { at: this.time + milliseconds, task, cancelled: false }
    this.tasks.push(entry)
    return () => {
      entry.cancelled = true
    }
  }

  advance(milliseconds: number) {
    this.time += milliseconds
    const due = this.tasks.filter((entry) => !entry.cancelled && entry.at <= this.time)
    this.tasks = this.tasks.filter((entry) => !due.includes(entry))
    for (const entry of due) entry.task()
  }
}

export class MemoryClipboard implements Clipboard {
  constructor(public text = '') {}
  async readText() {
    return this.text
  }
  async writeText(text: string) {
    this.text = text
  }
}

export class MemorySecretStore implements SecretStore {
  private readonly entries = new Map<string, string>()
  async get(key: string) {
    return this.entries.get(key)
  }
  async set(key: string, value: string) {
    this.entries.set(key, value)
  }
  async delete(key: string) {
    this.entries.delete(key)
  }
}

const contains = (rectangle: Rectangle, point: Point) =>
  point.x >= rectangle.x &&
  point.x < rectangle.x + rectangle.width &&
  point.y >= rectangle.y &&
  point.y < rectangle.y + rectangle.height

const distance = (rectangle: Rectangle, point: Point) =>
  Math.hypot(
    point.x - (rectangle.x + rectangle.width / 2),
    point.y - (rectangle.y + rectangle.height / 2),
  )

export class FakeScreen implements Screen {
  constructor(
    public displays: readonly Display[],
    public cursor: Point,
  ) {}

  cursorPoint() {
    return this.cursor
  }

  displayNearest(point: Point): Display {
    const inside = this.displays.find((display) => contains(display.bounds, point))
    const nearest = [...this.displays].sort(
      (a, b) => distance(a.bounds, point) - distance(b.bounds, point),
    )[0]
    const display = inside ?? nearest
    if (!display) throw new Error('FakeScreen has no displays')
    return display
  }
}

// Imita o gerenciador de janelas do X11 que ignora a posição pedida antes de mostrar quando ela é (0,0)
export class FakeDockWindow implements DockWindow {
  private visible = false
  private focused = false
  private current: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  private pending: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  readonly calls: string[] = []

  constructor(private readonly ignoresOriginBeforeShow = false) {}

  isVisible() {
    return this.visible
  }
  isFocused() {
    return this.focused
  }
  bounds() {
    return this.current
  }
  setBounds(bounds: Rectangle) {
    this.calls.push('setBounds')
    if (this.visible) this.current = bounds
    else this.pending = bounds
  }
  show() {
    this.calls.push('show')
    this.visible = true
    const lost = this.ignoresOriginBeforeShow && this.pending.x === 0 && this.pending.y === 0
    this.current = lost ? { ...this.pending, x: 3744, y: 32, height: 1080 } : this.pending
  }
  hide() {
    this.calls.push('hide')
    this.visible = false
    this.focused = false
  }
  focus() {
    this.calls.push('focus')
    if (this.visible) this.focused = true
  }
  blur() {
    this.focused = false
  }
}

export class FakePtySession implements PtySession {
  readonly pid = 1
  readonly written: string[] = []
  size: { cols: number; rows: number }
  killed = false
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(exit: PtyExit) => void>()

  constructor(options: PtyOptions) {
    this.size = { cols: options.cols, rows: options.rows }
  }

  write(data: string) {
    this.written.push(data)
  }
  resize(cols: number, rows: number) {
    this.size = { cols, rows }
  }
  kill() {
    this.killed = true
  }
  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }
  onExit(listener: (exit: PtyExit) => void) {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }
  emitData(data: string) {
    for (const listener of this.dataListeners) listener(data)
  }
  emitExit(exit: PtyExit) {
    for (const listener of this.exitListeners) listener(exit)
  }
}

export class FakePtyHost implements PtyHost {
  readonly sessions: FakePtySession[] = []
  spawn(options: PtyOptions) {
    const session = new FakePtySession(options)
    this.sessions.push(session)
    return session
  }
}
