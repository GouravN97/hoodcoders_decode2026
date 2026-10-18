import { useManualEvidence } from '../../api/queries';
import { HandIcon } from '../../components/icons';
import { Button, Card, Spinner } from '../../components/ui';

/** Human-in-the-loop evidence: the person confirms the credential is visible in the wallet. */
export function HoldConfirmCard({ runId, walletName }: { runId: string; walletName: string }) {
  const confirm = useManualEvidence(runId);
  return (
    <Card className="border-accent/40" aria-label="Confirm credential received">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-accent">
            <HandIcon width={20} height={20} />
          </span>
          <div>
            <p className="text-sm font-semibold">Is the credential in {walletName}?</p>
            <p className="text-[13px] text-muted">
              The issuer has sent the credential. Check that it appears in the wallet, then confirm to move on to
              presenting it.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          disabled={confirm.isPending || confirm.isSuccess}
          onClick={() => confirm.mutate({ step: 'credential_held', note: 'Confirmed from the run screen' })}
        >
          {confirm.isPending && <Spinner />}I can see the credential in my wallet
        </Button>
        {confirm.isError && <p className="text-xs text-bad">{confirm.error.message}</p>}
      </div>
    </Card>
  );
}
