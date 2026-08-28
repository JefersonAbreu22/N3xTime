import { Component, type ErrorInfo, type ReactNode } from 'react';

const RETRY_WINDOW_MS = 30_000;
const RETRY_KEY = 'n3xtime:chunk-load-retry';

const isChunkLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|importing a module script failed|chunkloaderror/i.test(message);
};

export default class ChunkLoadRecovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isChunkLoadError(error)) return;

    const now = Date.now();
    const lastAttempt = Number(window.sessionStorage.getItem(RETRY_KEY) || 0);
    if (!lastAttempt || now - lastAttempt > RETRY_WINDOW_MS) {
      window.sessionStorage.setItem(RETRY_KEY, String(now));
      window.location.reload();
      return;
    }

    this.setState({ failed: true });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f6f4f4] px-6 text-center text-[#191717]">
          <h1 className="text-xl font-semibold">Atualização disponível</h1>
          <p className="max-w-md text-sm leading-6 text-[#6e6a6a]">Não foi possível carregar uma parte da versão atual.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Atualizar página</button>
        </div>
      );
    }
    return this.props.children;
  }
}
