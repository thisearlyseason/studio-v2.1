export async function observeAction({ client, session, stage, terminal, action } = {}) {
  if (!client || typeof client.captureSignalWindow !== 'function') {
    throw new Error('Action observation requires a Playwright CLI client.');
  }
  if (typeof session !== 'string' || session.length === 0) throw new Error('Action observation requires a session.');
  if (typeof stage !== 'string' || stage.length === 0) throw new Error('Action observation requires a stage.');
  if (typeof terminal !== 'function') throw new Error('Action observation requires a terminal function.');
  if (typeof action !== 'function') throw new Error('Action observation requires an action function.');

  return client.captureSignalWindow({ session, stage, action, terminal });
}
