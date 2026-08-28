/* eslint-disable react-refresh/only-export-components -- relatório reúne componentes e exportadores compartilhados */
import { type ReactNode } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BiometricHistoryEvent } from '../../../services/authApi';
import { methodLabel } from '../../../components/dashboard/dashboardUtils';

export const buildBiometricEventDetail = (event: BiometricHistoryEvent) => {
  const metadata = event.parsedMetadata ?? null;

  if (event.event_type === 'reset') {
    const previousSamples = Number(metadata?.previousSampleCount ?? 0);
    return previousSamples > 0
      ? `${previousSamples} amostra(s) removida(s) para recadastro`
      : 'Recadastro biométrico liberado';
  }

  if (event.event_type === 'enrollment') {
    const sampleCount = Number(metadata?.sampleCount ?? 0);
    return sampleCount > 0 ? `${sampleCount} amostra(s) capturada(s)` : 'Cadastro facial atualizado';
  }

  if (event.reason === 'pin_rate_limited') {
    const retryInSeconds = Number(metadata?.retryInSeconds ?? 0);
    return retryInSeconds > 0 ? `Nova tentativa em ${retryInSeconds}s` : 'PIN bloqueado por excesso de falhas';
  }

  if (event.reason === 'pin_invalid') {
    const failedAttempts = Number(metadata?.failedAttempts ?? 0);
    return failedAttempts > 0 ? `${failedAttempts} tentativa(s) inválida(s)` : 'Tentativa com PIN rejeitada';
  }

  if (event.match_score) {
    return `Confiança ${Math.round(Number(event.match_score) * 100)}% via ${methodLabel(event.method)}`;
  }

  return methodLabel(event.method);
};

export const buildBiometricActorLabel = (event: BiometricHistoryEvent) => {
  if (event.triggeredByUser?.name) return event.triggeredByUser.name;
  if (event.method === 'manual' || event.method === 'web') return 'Operação interna';
  return 'Totem';
};

export const csvEscape = (value: string | number | null | undefined) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

export const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const reportPrintStyles = `
  body { font-family: Arial, sans-serif; margin: 24px; color: #191717; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { font-size: 12px; color: #5f5a5a; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #d9d7d7; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
  th { background: #edf8f8; color: #014f4f; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; }
  tr:nth-child(even) td { background: #faf9f9; }
`;

export const downloadHtmlAsExcel = ({
  title,
  subtitle,
  fileName,
  columns,
  rows,
}: {
  title: string;
  subtitle: string;
  fileName: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}) => {
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>${reportPrintStyles}</style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('')}
        </tbody>
      </table>
    </body>
  </html>`;

  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const exportTableToPdf = ({
  companyName,
  title,
  subtitle,
  fileName,
  columns,
  rows,
  signature,
  orientation,
  fontSize = 9,
  columnStyles,
}: {
  companyName: string;
  title: string;
  subtitle: string;
  fileName: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
  signature?: { collaboratorName?: string };
  orientation?: 'portrait' | 'landscape';
  fontSize?: number;
  columnStyles?: Record<number, {
    cellWidth?: number | 'auto' | 'wrap';
    halign?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    overflow?: 'linebreak' | 'ellipsize' | 'visible' | 'hidden';
  }>;
}) => {
  const doc = new jsPDF({
    orientation: orientation ?? (columns.length > 6 ? 'landscape' : 'portrait'),
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 80;

  const normalizedCompanyName = companyName.trim() || 'Empresa não configurada';
  const generatedAt = new Date().toLocaleString('pt-BR');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(1, 102, 102);
  doc.text(normalizedCompanyName, 40, 22);
  doc.setDrawColor(185, 222, 222);
  doc.setLineWidth(0.8);
  doc.line(40, 30, pageWidth - 40, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(25, 23, 23);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, 40, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(95, 90, 90);
  const subtitleY = 52 + (titleLines.length * 18);
  const subtitleLines = doc.splitTextToSize(subtitle, contentWidth);
  doc.text(subtitleLines, 40, subtitleY);
  const tableStartY = subtitleY + (subtitleLines.length * 11) + 8;

  autoTable(doc, {
    startY: tableStartY,
    head: [columns],
    body: rows.map((row) => row.map((cell) => String(cell ?? '—'))),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding: 4,
      lineColor: [217, 215, 215],
      lineWidth: 1,
      textColor: [25, 23, 23],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [237, 248, 248],
      textColor: [1, 79, 79],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 249, 249],
    },
    columnStyles,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    margin: { top: 72, right: 40, bottom: 40, left: 40 },
  });

  if (signature) {
    const tableEndY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? tableStartY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const signatureWidth = doc.internal.pageSize.getWidth() - 80;
    const signatureMiddle = 40 + (signatureWidth / 2);
    let signatureY = tableEndY + 58;
    if (signatureY > pageHeight - 58) {
      doc.addPage();
      signatureY = 110;
    }
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.7);
    doc.line(40, signatureY, signatureMiddle - 30, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('Assinatura do colaborador', 40, signatureY + 14);
    if (signature.collaboratorName) doc.text(signature.collaboratorName, 40, signatureY + 27);
    doc.text('Declaro ciência deste espelho de ponto. Data: ____/____/______', signatureMiddle + 10, signatureY + 14);
  }

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const currentPageWidth = doc.internal.pageSize.getWidth();
    const currentPageHeight = doc.internal.pageSize.getHeight();

    if (pageNumber > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(1, 102, 102);
      doc.text(normalizedCompanyName, 40, 22);
      doc.setDrawColor(185, 222, 222);
      doc.line(40, 30, currentPageWidth - 40, 30);
      doc.setFontSize(11);
      doc.setTextColor(25, 23, 23);
      doc.text(title, 40, 50, { maxWidth: currentPageWidth - 80 });
    }

    doc.setDrawColor(220, 216, 216);
    doc.line(40, currentPageHeight - 28, currentPageWidth - 40, currentPageHeight - 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95, 90, 90);
    doc.text(`Emitido em ${generatedAt}`, 40, currentPageHeight - 14);
    doc.text(`Página ${pageNumber} de ${pageCount}`, currentPageWidth - 40, currentPageHeight - 14, { align: 'right' });
  }

  const companyFilePart = normalizedCompanyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'empresa';
  doc.save(`${companyFilePart}-${fileName}`);
};

export const ReportStatCard = ({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description: string;
}) => (
  <div className="kpi-tile">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="kpi-caption">{description}</div>
  </div>
);

export const ReportInsightCard = ({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description?: string;
}) => (
  <div className="insight-card">
    <div className="metric-label">{label}</div>
    <div className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#191717]">{value}</div>
    {description ? <div className="mt-2 text-sm leading-6 text-[#6e6a6a]">{description}</div> : null}
  </div>
);

export const ReportSectionHeader = ({
  eyebrow,
  title,
  note,
  aside,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  aside?: ReactNode;
}) => (
  <div className="section-header">
    <div>
      <div className="section-kicker">{eyebrow}</div>
      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">{title}</h3>
      {note ? <p className="mt-3 section-note">{note}</p> : null}
    </div>
    {aside ? <div className="text-sm text-[#6e6a6a]">{aside}</div> : null}
  </div>
);
