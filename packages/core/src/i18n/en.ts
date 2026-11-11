import type { MessageKey } from './pt-BR.ts'

// O tipo obriga a ter todas as chaves do catálogo de referência
export const en: Record<MessageKey, string> = {
  'panel.title': 'Panel',

  'sessions.label': 'Sessions',
  'sessions.count.one': '{count} tab',
  'sessions.count.other': '{count} tabs',
  'sessions.noInfo': 'No information',
  'sessions.idle': 'Waiting for a command',
  'sessions.claude': 'Claude running',
  'sessions.busy': 'Running {process}',
  'sessions.finished': 'Finished, {process} in {duration}',
  'sessions.new': 'new',

  'git.label': 'Git',
  'git.staged': 'Staged Changes',
  'git.changes': 'Changes',
  'git.pull': 'Pull',
  'git.push': 'Push',
  'git.submodules': 'Submodules',
  'git.summary.one': '{count} change',
  'git.summary.other': '{count} changes',
  'git.clean': 'No changes',
  'git.notRepository': 'Not a git repository',
  'git.detached': 'Detached HEAD',
  'git.sync': '{behind} to pull, {ahead} to push',
  'git.moduleChanges.one': '{count} change',
  'git.moduleChanges.other': '{count} changes',
  'git.modulesClean': '{count} unchanged',
  'git.files': 'files',
  'git.commits': 'commits',
  'git.showMore': 'Show {count} more {noun}',
  'git.showLess': 'Show less',
  'git.pullTip': 'Commits on {upstream} not pulled yet',
  'git.pushTip': 'Local commits not pushed to {upstream} yet',
  'git.ticketTip': 'Ticket taken from the branch name',

  'ago.now': 'now',
  'ago.min': '{value} min ago',
  'ago.h': '{value} h ago',
  'ago.d': '{value} d ago',

  'notify.title': 'Dev Cockpit',
  'notify.finished': '{tab}: {process} finished in {duration}',
}
