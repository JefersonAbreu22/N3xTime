type FullScreenLoaderProps = {
  message?: string;
};

export default function FullScreenLoader({
  message = 'Carregando...',
}: FullScreenLoaderProps) {
  return (
    <div
      className="n3x-loader-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="n3x-loader-content">
        <img
          src="/icone_N3.ico"
          alt="N3xTime"
          className="n3x-loader-icon"
        />

        <div className="n3x-loader-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <span className="sr-only">{message}</span>
      </div>
    </div>
  );
}