export type PwaInstallPrompt = Event & {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: string }>;
};

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
