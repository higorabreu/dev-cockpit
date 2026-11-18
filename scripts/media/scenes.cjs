// The README clips. Each has the settings it starts with, an off-camera setup and the recorded run; the
// marks it sets are what clips.py times its cuts, zooms and captions by.
const connections = {
  github: { url: 'http://localhost:18877' },
  jira: { url: 'http://localhost:18876', email: 'ana@example.com' },
}

// Opens the projects as tabs in this order and closes the tab the window started with
async function tabs(c, names) {
  await c.show()
  for (const name of names) await c.search(name, 5)
  await c.page.keyboard.press('Alt+1')
  await c.sleep(400)
  await c.page.keyboard.press('Control+Shift+W')
  await c.sleep(800)
  await c.page.keyboard.press(`Alt+${names.length}`)
  await c.sleep(400)
}

const clearScreen = async (c) => {
  await c.type('clear\n', 5)
  await c.sleep(500)
}

const claudeReady = (c) =>
  c.waitFor(async () => /accept edits on/.test(await c.screenText()), 60000, 'claude ready')

const railButton = (c, label) => c.page.locator(`#rail button[aria-label^="${label}"]`)

// The Work screen fetched once, so its lists and the rail's dot are there when the clip starts
async function warmWork(c) {
  await c.page.keyboard.press('Control+Shift+M')
  await c.sleep(3500)
  await c.page.keyboard.press('Escape')
  await c.sleep(800)
}

// Holds the wheel's key, picks a category with an arrow and moves down its list to the item named
async function holdMenu(c, arrow, item, settle = 800) {
  const list = () =>
    c.page.evaluate(() =>
      [...document.querySelectorAll('.list .it')].map((n) => ({
        label: n.querySelector('.l')?.textContent ?? '',
        on: n.classList.contains('on'),
      })),
    )
  await c.page.keyboard.down('ControlRight')
  await c.sleep(settle)
  await c.page.keyboard.press(arrow)
  await c.sleep(settle)
  const items = await list()
  const from = items.findIndex((entry) => entry.on)
  const to = items.findIndex((entry) => entry.label.startsWith(item))
  if (from < 0 || to < 0) throw new Error(`invariant: ${item} not in the wheel's list`)
  for (let i = 0; i < (to - from + items.length) % items.length; i++) {
    await c.page.keyboard.press('ArrowDown')
    await c.sleep(450)
  }
  await c.sleep(settle / 2)
  console.log('WHEEL', (await list()).find((entry) => entry.on)?.label)
  await c.page.keyboard.up('ControlRight')
}

module.exports = {
  hero: {
    settings: { connections },
    async setup(c) {
      await tabs(c, ['acme-web', 'acme-api'])
      // acme-api goes back to the recent projects the wheel lists; the clip opens it from there
      await c.page.keyboard.press('Control+Shift+W')
      await c.sleep(800)
      await c.panel(true)
      await warmWork(c)
      await clearScreen(c)
      await c.type('git log --oneline -3\n', 5)
      await c.sleep(800)
      await c.shot('setup')
    },
    async run(c) {
      const { page, sleep, mark, shot } = c
      await sleep(1500)
      const work = await c.centerOf(railButton(c, 'Work'))
      await c.glide(work.x, work.y, 600)
      mark('work-hover')
      await sleep(1300)
      await shot('work-hover')
      await c.click(work.x, work.y, 100)
      mark('work')
      await c.park()
      await sleep(1800)
      await shot('work')
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press('ArrowRight')
        await sleep(500)
      }
      mark('tasks')
      await sleep(1000)
      await page.keyboard.press('Control+C')
      mark('copy')
      await sleep(1200)
      await shot('copy')
      await page.keyboard.press('Escape')
      await sleep(500)
      mark('wheel-project')
      await holdMenu(c, 'ArrowRight', 'acme-api')
      mark('project')
      await sleep(1300)
      await shot('project')
      mark('wheel-agent')
      await holdMenu(c, 'ArrowDown', 'Start Claude')
      mark('claude-start')
      await claudeReady(c)
      await sleep(800)
      mark('claude-ready')
      await page.keyboard.press('Control+Shift+V')
      await sleep(300)
      await c.type(
        ': validate the email and password in src/signup.js, add tests, run npm test',
        22,
      )
      await sleep(400)
      await page.keyboard.press('Enter')
      mark('prompt-sent')
      await sleep(2500)
      await shot('working')
      await page.keyboard.press('Control+PageUp')
      mark('other-tab')
      await sleep(600)
      await c.type('npm test\n', 70)
      await sleep(2500)
      await shot('tests')
      await c.waitFor(
        async () => (await page.$$eval('.tab .pip.needs-you', (n) => n.length)) > 0,
        240000,
        'needs-you',
      )
      mark('needs-you')
      await sleep(1600)
      await shot('needs-you')
      await c.glide(c.W - 14 - 190, 14 + 38, 700)
      await sleep(400)
      c.clickNotification()
      mark('clicked')
      await sleep(300)
      await c.park()
      await sleep(1500)
      await shot('back')
      await page.keyboard.press('Enter')
      mark('approve')
      await sleep(1800)
      await shot('approved')
      c.toggle()
      mark('hide')
      await sleep(1300)
      c.toggle()
      mark('show')
      await sleep(1500)
    },
  },

  review: {
    settings: {
      window: { heightRatio: 0.86, restoreTabs: false },
      review: { layout: 'side', sideRatio: 0.4 },
    },
    async setup(c) {
      await tabs(c, ['acme-api'])
      await c.panel(false)
      await clearScreen(c)
      await c.type('claude\n', 5)
      await claudeReady(c)
      await c.sleep(800)
      await c.type(
        'Validate the email and password in src/signup.js with clear error messages and add tests to test/signup.test.js. Do not run anything.\n',
        3,
      )
      await c.sleep(8000)
      await c.quiet(6000, 300000)
      await c.shot('setup')
    },
    async run(c) {
      const { page, sleep, mark, shot } = c
      await sleep(800)
      await page.keyboard.press('Control+Shift+D')
      mark('review')
      await sleep(2000)
      await shot('review')
      const review = page.locator('.tabview.active .review')
      const commits = await c.centerOf(review.locator('.rv-mod-commits, .rv-mod-subjects'))
      await c.glide(commits.x, commits.y, 600)
      mark('module')
      await sleep(1800)
      await shot('module')
      const file = await c.centerOf(review.locator('.rv-file', { hasText: 'invoice.js' }))
      await c.click(file.x, file.y, 400)
      mark('file')
      await sleep(1300)
      const first = await c.centerOf(review.locator('.rv-row', { hasText: 'rate = 0' }))
      const last = await c.centerOf(review.locator('.rv-row', { hasText: 'const subtotal' }))
      await c.click(first.x, first.y, 500)
      await sleep(300)
      await c.glide(last.x, last.y, 250)
      shiftClick(last)
      mark('select')
      await sleep(700)
      await c.park()
      await page.keyboard.press('c')
      mark('comment')
      await sleep(500)
      await c.type('A missing rate should throw, not bill without tax', 30)
      await sleep(400)
      await page.keyboard.press('Control+Enter')
      mark('saved')
      await sleep(1200)
      await shot('saved')
      await page.keyboard.press('Control+Shift+Enter')
      mark('sent')
      await sleep(1800)
      await shot('sent')
      await page.keyboard.press('Enter')
      mark('submitted')
      await c.waitFor(
        async () => (await review.locator('.rv-row', { hasText: 'throw' }).count()) > 0,
        240000,
        'review updated',
      )
      mark('updated')
      await sleep(400)
      // The index brings the changed file to the top of the diff, where the clip zooms
      const changed = await c.centerOf(review.locator('.rv-file', { hasText: 'invoice.js' }))
      await c.click(changed.x, changed.y, 400)
      await c.park()
      mark('shown')
      await sleep(2800)
      await shot('updated')
    },
  },

  dropdown: {
    settings: { window: { heightRatio: 0.5, restoreTabs: false } },
    async setup(c) {
      await tabs(c, ['acme-api', 'acme-web'])
      await c.panel(true)
      await clearScreen(c)
      await c.type('git status --short --branch\n', 5)
      await c.sleep(800)
    },
    async run(c) {
      const { sleep, mark, shot } = c
      await sleep(1200)
      const edge = Math.round(c.H * 0.5) - 2
      await c.drag({ x: 640, y: edge }, { x: 640, y: 540 }, 700)
      mark('taller')
      await sleep(900)
      await c.drag({ x: 640, y: 538 }, { x: 640, y: c.H - 1 }, 600)
      mark('full')
      await sleep(1700)
      await shot('full')
      await c.drag({ x: 640, y: c.H - 2 }, { x: 640, y: edge }, 700)
      mark('back')
      await c.park()
      await sleep(900)
      c.toggle()
      mark('hide')
      await sleep(1300)
      c.toggle()
      mark('show')
      await sleep(1400)
    },
  },

  work: {
    settings: { connections },
    async setup(c) {
      await tabs(c, ['acme-web'])
      await c.panel(true)
      await warmWork(c)
      await clearScreen(c)
      await c.type('git log --oneline -3\n', 5)
      await c.sleep(800)
    },
    async run(c) {
      const { page, sleep, mark, shot } = c
      await sleep(700)
      const work = await c.centerOf(railButton(c, 'Work'))
      await c.glide(work.x, work.y, 600)
      mark('hover')
      await sleep(1300)
      await c.click(work.x, work.y, 100)
      mark('views')
      await c.park()
      await sleep(1600)
      await c.type('cache', 120)
      mark('filter')
      await sleep(1800)
      await shot('filter')
      await page.keyboard.press('Enter')
      mark('open')
      // The clip cuts to the page once its window is on screen and painted
      await c.waitFor(() => c.windowShown('browser'), 10000, 'browser page')
      await sleep(700)
      mark('page')
      await sleep(2200)
      await shot('open')
      // The browser closes and the Work screen with it, so the clip loops back to where it started
      c.closeBrowser()
      mark('closed')
      await sleep(600)
      // The first Escape clears the filter, the second closes the Work screen
      await page.keyboard.press('Escape')
      await sleep(150)
      await page.keyboard.press('Escape')
      await sleep(1200)
    },
  },
}

// Shift+click with the real pointer, as a reader extends a selection
function shiftClick(at) {
  const { execFileSync } = require('node:child_process')
  execFileSync('xdotool', [
    'mousemove',
    String(at.x),
    String(at.y),
    'keydown',
    'shift',
    'click',
    '1',
    'keyup',
    'shift',
  ])
}
