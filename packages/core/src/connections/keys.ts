// Perfis diferentes (o modo dev, os testes) usam o mesmo cofre do sistema: sem prefixo, um apagaria o token do outro
export const gitlabTokenKey = (profile: string | undefined): string =>
  profile ? `${profile}:gitlab.token` : 'gitlab.token'
