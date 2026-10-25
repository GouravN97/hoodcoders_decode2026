import { api, type ReportFormat } from '../../api/client';

export async function downloadReport(runId: string, format: ReportFormat) {
  saveBlob(await api.reportFile(runId, format), `run-${runId}.${format}`);
}

/** Saves text as a file through a temporary link. */
export function saveText(text: string, filename: string, type = 'text/markdown') {
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
