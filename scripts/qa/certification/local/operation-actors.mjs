export function operationActorAliases(execution) {
  const actors = typeof execution?.actor === 'string' ? execution.actor.split('+').map(actor => actor.trim()) : [];
  if (!actors.length || new Set(actors).size !== actors.length || actors.some(actor => !/^qa-[a-z0-9][a-z0-9-]*$/.test(actor))) {
    throw new Error('Operation execution requires explicit, unique fixture actor aliases.');
  }
  const requestActors = [...new Set((execution.requests || []).map(request => request.actorAlias))];
  if (requestActors.length !== actors.length || requestActors.some(actor => !actors.includes(actor))) {
    throw new Error('Operation request actors do not reconcile with every explicit execution actor.');
  }
  return actors;
}

export function assertOperationActorAliases(actorAliases, execution) {
  const expected = operationActorAliases(execution);
  if (JSON.stringify(actorAliases) !== JSON.stringify(expected)) {
    throw new Error('Operation top-level actor aliases do not match exact execution/request actors.');
  }
}
