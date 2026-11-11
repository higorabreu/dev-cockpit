// Catálogo de referência: as chaves daqui definem o tipo das outras línguas.
// Plural usa o par `chave.one` e `chave.other`, e `{nome}` marca um parâmetro.
export const ptBR = {
  'panel.title': 'Painel',

  'sessions.label': 'Sessões',
  'sessions.count.one': '{count} aba',
  'sessions.count.other': '{count} abas',
  'sessions.noInfo': 'Sem informação',
  'sessions.idle': 'Aguardando comando',
  'sessions.claude': 'Claude em execução',
  'sessions.busy': 'Executando {process}',
  'sessions.finished': 'Terminou, {process} em {duration}',
  'sessions.new': 'novo',

  'git.label': 'Git',
  'git.staged': 'Alterações em Stage',
  'git.changes': 'Alterações',
  'git.pull': 'Pull',
  'git.push': 'Push',
  'git.submodules': 'Submódulos',
  'git.summary.one': '{count} alteração',
  'git.summary.other': '{count} alterações',
  'git.clean': 'Nenhuma alteração',
  'git.notRepository': 'Não é um repositório git',
  'git.detached': 'HEAD desanexada',
  'git.sync': '{behind} para pull, {ahead} para push',
  'git.moduleChanges.one': '{count} alteração',
  'git.moduleChanges.other': '{count} alterações',
  'git.modulesClean': '{count} sem alterações',
  'git.files': 'arquivos',
  'git.commits': 'commits',
  'git.showMore': 'Mostrar mais {count} {noun}',
  'git.showLess': 'Mostrar menos',
  'git.pullTip': 'Commits de {upstream} que ainda faltam trazer',
  'git.pushTip': 'Commits locais que ainda faltam enviar para {upstream}',
  'git.ticketTip': 'Ticket extraído do nome da branch',

  'ago.now': 'agora',
  'ago.min': 'há {value} min',
  'ago.h': 'há {value} h',
  'ago.d': 'há {value} d',

  'notify.title': 'Dev Cockpit',
  'notify.finished': '{tab}: {process} terminou em {duration}',
} as const

export type MessageKey = keyof typeof ptBR
