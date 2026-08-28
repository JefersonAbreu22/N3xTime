import { useEffect, useState, type ReactNode } from 'react';
import { http } from '../../services/http';

type FileKind = 'record-photo' | 'request-attachment';

const endpointFor = (kind: FileKind, id: number) => kind === 'record-photo'
  ? `/files/records/${id}/photo`
  : `/files/requests/${id}/attachment`;

const useProtectedFile = (kind: FileKind, id: number, enabled: boolean) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);

    http.get<Blob>(endpointFor(kind, id), { responseType: 'blob' })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, id, kind]);

  return { url, failed };
};

const isExternalUrl = (value?: string | null) => Boolean(value && /^https?:\/\//i.test(value));

export function ProtectedAttachmentLink({
  requestId,
  sourceUrl,
  children,
  className,
}: {
  requestId: number;
  sourceUrl?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const external = isExternalUrl(sourceUrl);
  const { url, failed } = useProtectedFile('request-attachment', requestId, Boolean(sourceUrl) && !external);

  if (external) return <a className={className} href={sourceUrl!} target="_blank" rel="noreferrer">{children}</a>;
  if (failed) return <span className="text-sm text-[#a09c9c]" title="Arquivo indisponível ou sem permissão">Indisponível</span>;
  if (!url) return <span className="text-sm text-[#6e6a6a]">Carregando…</span>;
  return <a className={className} href={url} target="_blank" rel="noreferrer">{children}</a>;
}

export function ProtectedRecordPhoto({
  recordId,
  className,
  linkClassName,
}: {
  recordId: number;
  className: string;
  linkClassName?: string;
}) {
  const { url, failed } = useProtectedFile('record-photo', recordId, true);

  if (failed) return <div className={`${className} flex items-center justify-center text-center text-xs text-[#a09c9c]`}>Foto indisponível</div>;
  if (!url) return <div className={`${className} animate-pulse bg-[#f0eded]`} aria-label="Carregando foto" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Abrir foto original" className={linkClassName}>
      <img src={url} alt="Selfie do registro remoto" className={className} />
    </a>
  );
}
