import { api, type ReportFormat } from '../../api/client';

export async function downloadReport(runId: string, format: ReportFormat) {
  const blob = await api.reportFile(runId, format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `run-${runId}.${format}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
