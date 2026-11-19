# Per clip, from the marks its scene set: segments (from, to, speed) in event time, camera keyframes
# (time, source rectangle of 16:9) between which the view eases, and captions (from, to, text, keys).
FULL = (0, 0, 1280, 720)


def hero(e):
    # Every zoom stays inside the cockpit, which takes the top 504 pixels: no sliver of the desktop
    rail = (800, 234, 480, 270)
    work = (190, 0, 896, 504)
    wheel = (200, 0, 896, 504)
    prompt = (0, 96, 726, 408)
    tests = (0, 20, 860, 484)
    notice = (740, 0, 540, 304)
    return {
        'segments': [
            (0.0, e['work-hover'] - 0.3, 1.6), (e['work-hover'] - 0.3, e['work'], 1.5),
            (e['work'], e['tasks'], 2), (e['tasks'], e['copy'] + 0.9, 1.5), (e['copy'] + 0.9, e['wheel-project'], 2),
            (e['wheel-project'], e['project'] + 0.3, 1.3), (e['project'] + 0.3, e['wheel-agent'], 2),
            (e['wheel-agent'], e['claude-start'], 1.3), (e['claude-start'], e['claude-ready'], 2),
            (e['claude-ready'], e['prompt-sent'], 2.4), (e['prompt-sent'], e['other-tab'], 2.5),
            (e['other-tab'], e['other-tab'] + 3.5, 1.5), (e['other-tab'] + 3.5, e['needs-you'], 4),
            (e['needs-you'], e['clicked'], 1.4), (e['clicked'], e['approve'] + 0.3, 1.5),
            (e['approve'] + 0.3, e['hide'], 2), (e['hide'], e['show'], 1.6), (e['show'], e['end'], 1),
        ],
        'camera': [
            # Quick moves and cuts: every step of a pan is a whole new GIF frame
            (0, FULL), (e['work-hover'] - 0.5, FULL), (e['work-hover'] - 0.1, rail), (e['work'] - 0.1, rail),
            (e['work'] + 0.25, work), (e['wheel-project'], work), (e['wheel-project'] + 0.3, wheel),
            (e['claude-start'] + 0.1, wheel), (e['claude-start'] + 0.45, prompt), (e['other-tab'], prompt),
            (e['other-tab'] + 0.05, tests), (e['needs-you'] - 0.05, tests), (e['needs-you'], FULL),
            (e['needs-you'] + 1.3, FULL), (e['needs-you'] + 1.7, notice), (e['clicked'], notice),
            (e['clicked'] + 0.05, prompt), (e['approve'] + 0.4, prompt), (e['approve'] + 0.8, FULL),
            (e['end'] + 5, FULL),
        ],
        'captions': [
            (0, e['work-hover'], 'Your terminal, one key away', ['F12']),
            (e['work-hover'], e['work'], 'A dot says something waits for you', []),
            (e['work'], e['tasks'], 'Your reviews and tasks in one screen', ['Ctrl', 'Shift', 'M']),
            (e['tasks'], e['wheel-project'], "Copy today's task", ['Ctrl', 'C']),
            (e['wheel-project'], e['wheel-agent'], 'Hold for the action wheel, open the project', ['Right Ctrl']),
            (e['wheel-agent'], e['prompt-sent'] + 0.4, 'Start the agent on the task', []),
            (e['other-tab'], e['needs-you'], 'Keep working in another tab', ['Ctrl', 'PgUp']),
            (e['needs-you'], e['clicked'], 'It tells you when the agent needs you', []),
            (e['clicked'], e['approve'], 'One click: back on its tab', []),
            (e['approve'], e['hide'], 'Approve, back to work', ['Enter']),
            (e['hide'], e['end'] + 1, 'Gone, and back, with one key', ['F12']),
        ],
    }


def review(e):
    index = (480, 0, 800, 450)
    diff = (500, 180, 780, 439)
    prompt = (0, 300, 560, 315)
    return {
        'segments': [
            (0.0, e['review'] + 0.3, 1.5), (e['review'] + 0.3, e['module'] + 1.6, 1.5),
            (e['module'] + 1.6, e['select'], 2), (e['select'], e['comment'], 1.2), (e['comment'], e['saved'], 2.6),
            (e['saved'], e['sent'], 1.5), (e['sent'], e['submitted'] + 0.4, 1.6), (e['submitted'] + 0.4, e['updated'], 20),
            (e['updated'], e['shown'], 1.5), (e['shown'], e['end'] - 0.6, 1),
        ],
        'camera': [
            # Short moves and cuts: a long pan over dense code costs a full GIF frame per step
            (0, FULL), (e['review'] + 0.5, FULL), (e['review'] + 0.9, index), (e['file'], index),
            (e['file'] + 0.3, diff), (e['sent'], diff), (e['sent'] + 0.05, prompt), (e['updated'], prompt),
            (e['updated'] + 0.05, diff), (e['end'] + 5, diff),
        ],
        'captions': [
            (0, e['module'], 'Review what the agent changed', ['Ctrl', 'Shift', 'D']),
            (e['module'], e['file'], 'Submodules too, with their new commits', []),
            (e['file'], e['saved'], 'Comment on lines, as in a pull request', ['c']),
            (e['saved'], e['submitted'] + 0.4, 'Send the comments to the agent', ['Ctrl', 'Shift', 'Enter']),
            (e['submitted'] + 0.4, e['updated'], 'It works on them', []),
            (e['updated'], e['end'] + 1, 'The review follows, live', []),
        ],
    }


def dropdown(e):
    return {
        'segments': [
            (0.4, 1.0, 1), (1.0, e['taller'], 1.4), (e['taller'], e['full'], 1.4), (e['full'], e['back'] - 0.8, 1.6),
            (e['back'] - 0.8, e['back'], 1.4), (e['back'], e['hide'], 1.8), (e['hide'], e['show'], 1.6),
            (e['show'], e['end'], 1.2),
        ],
        'captions': [
            (0, e['taller'] - 0.4, 'A terminal over whatever you are doing', []),
            (e['taller'] - 0.4, e['full'], 'Drag its edge for more room', []),
            (e['full'], e['back'] - 0.5, 'All the way down, the tabs go on top', []),
            (e['back'] - 0.5, e['end'] + 1, 'Away and back with one key', ['F12']),
        ],
    }


def work(e):
    rail = (800, 234, 480, 270)
    dialog = (190, 0, 896, 504)
    page = (140, 40, 1000, 562)
    return {
        'segments': [
            (0.0, e['hover'], 1.4), (e['hover'], e['views'], 1.2), (e['views'], e['filter'], 1.5),
            (e['filter'], e['open'], 1.2), (e['open'], e['page'], 4), (e['page'], e['closed'], 1.2),
            (e['closed'], e['end'], 1),
        ],
        'camera': [
            (0, FULL), (e['hover'] - 0.5, FULL), (e['hover'] - 0.1, rail), (e['views'] - 0.1, rail),
            (e['views'] + 0.25, dialog), (e['page'] - 0.05, dialog), (e['page'], page), (e['closed'], page),
            (e['closed'] + 0.05, FULL), (e['end'] + 5, FULL),
        ],
        'captions': [
            (0, e['views'], 'A dot on Work: something waits', ['Ctrl', 'Shift', 'M']),
            (e['views'], e['filter'] - 0.4, 'Pull requests to review, and your tasks', []),
            (e['filter'] - 0.4, e['open'], 'Failing checks and conflicts at a glance', []),
            (e['open'], e['closed'], 'Open it in the browser', ['Enter']),
            (e['closed'], e['end'] + 1, 'And back to the terminal', ['Esc']),
        ],
    }


def editor(e):
    # The window is full height here, so every zoom stays inside the cockpit
    palette = (240, 0, 800, 450)
    edit = (0, 0, 800, 450)
    terminal = (0, 0, 1068, 601)
    return {
        'segments': [
            # Cut from Enter to the painted file, past the empty editor of the first open
            (0.3, e['search'], 1.5), (e['search'], e['open'], 1.3), (e['shown'], e['select'] - 0.6, 1.4),
            (e['select'] - 0.6, e['edited'], 1.2), (e['edited'], e['saved'], 1), (e['saved'], e['find'], 1.4),
            (e['find'], e['first'], 1.3), (e['first'], e['find-closed'], 1.4),
            (e['find-closed'], e['readme'], 1.6), (e['readme'], e['preview'], 1.5), (e['preview'], e['terminal'], 1.4),
            (e['terminal'], e['error'], 1.4), (e['error'], e['hover'], 1.3), (e['hover'], e['jump'], 1.2),
            (e['line'], e['end'], 1.1),
        ],
        'camera': [
            (0, FULL), (e['search'] - 0.1, FULL), (e['search'] + 0.25, palette), (e['open'] - 0.05, palette),
            (e['shown'], FULL), (e['select'] - 0.9, FULL), (e['select'] - 0.5, edit), (e['find'] - 0.2, edit),
            (e['find'] + 0.2, FULL), (e['terminal'] + 0.4, FULL), (e['terminal'] + 0.8, terminal), (e['jump'], terminal),
            (e['line'], FULL), (e['end'] + 5, FULL),
        ],
        'captions': [
            (0, e['shown'], "Find a file of the tab's project", ['Ctrl', 'Shift', 'O']),
            (e['shown'], e['select'], 'It opens over the tab, the shell still running', []),
            (e['select'], e['saved'], 'A ring while an edit is not saved', []),
            (e['saved'], e['find'], 'Saved by itself after a pause', []),
            (e['find'], e['first'], 'Find in the file', ['Ctrl', 'F']),
            (e['first'], e['find-closed'], 'From match to match', ['Enter']),
            (e['find-closed'], e['preview'], 'Markdown opens the same way', ['Ctrl', 'Shift', 'O']),
            (e['preview'], e['terminal'], 'And shows its preview', ['Ctrl', 'Shift', 'J']),
            (e['terminal'], e['hover'], 'Back to the terminal', ['Ctrl', 'Shift', 'Space']),
            (e['hover'], e['end'] + 1, 'A path in the output opens at its line', ['Ctrl', 'Click']),
        ],
    }


SCENES = {'hero': hero, 'review': review, 'dropdown': dropdown, 'work': work, 'editor': editor}
