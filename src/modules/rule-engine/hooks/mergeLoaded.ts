// Junta o resultado de uma busca inicial (fetch on mount) com o estado
// atual, preservando qualquer item que só existe localmente (otimista,
// ainda não confirmado pelo servidor — seja porque a escrita ainda tá
// em voo, seja porque falhou e nunca vai ser confirmada, ex: tabela
// ainda não migrada).
//
// Por quê: sem isso, cada hook fazia `fetchX().then(setX)` no mount, o
// que SOBRESCREVE o estado inteiro quando essa busca (uma chamada de
// rede de verdade, pode demorar) resolve DEPOIS de uma escrita
// otimista já ter acontecido — apagando o que o usuário acabou de
// adicionar/editar sem aviso nenhum. Isso é exatamente o que causava
// "Decisões do motor" sumir ou reaparecer de forma inconsistente.
export function mergeLoaded<T extends { id: string }>(loaded: T[], current: T[]): T[] {
  const loadedIds = new Set(loaded.map((item) => item.id));
  const localOnly = current.filter((item) => !loadedIds.has(item.id));
  return [...loaded, ...localOnly];
}
