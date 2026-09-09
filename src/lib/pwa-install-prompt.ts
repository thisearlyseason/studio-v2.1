export type PwaInstallPrompt = Event & {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: string }>;
};

type PwaInstallRequest = {
  isIOS: boolean;
  prompt: Pick<PwaInstallPrompt, 'prompt' | 'userChoice'> | null;
  showIOSInstructions: () => void;
  showGeneralInstructions: () => void;
  consumePrompt: () => void;
};

export async function requestPwaInstall({
  isIOS,
  prompt,
  showIOSInstructions,
  showGeneralInstructions,
  consumePrompt,
}: PwaInstallRequest): Promise<string> {
  if (isIOS) {
    showIOSInstructions();
    return 'instructions';
  }
  if (!prompt) {
    showGeneralInstructions();
    return 'instructions';
  }

  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  consumePrompt();
  return outcome;
}

type PromptListener = (prompt: PwaInstallPrompt | null) => void;

export class PwaInstallPromptBroker {
  private prompt: PwaInstallPrompt | null = null;
  private listeners = new Set<PromptListener>();

  capture(prompt: PwaInstallPrompt): void {
    prompt.preventDefault?.();
    this.prompt = prompt;
    this.listeners.forEach(listener => listener(prompt));
  }

  current(): PwaInstallPrompt | null {
    return this.prompt;
  }

  consume(): PwaInstallPrompt | null {
    const prompt = this.prompt;
    this.prompt = null;
    this.listeners.forEach(listener => listener(null));
    return prompt;
  }

  subscribe(listener: PromptListener): () => void {
    this.listeners.add(listener);
    listener(this.prompt);
    return () => this.listeners.delete(listener);
  }
}

export const pwaInstallPromptBroker = new PwaInstallPromptBroker();
