'use client';

import { Label, adminInput } from '@/components/admin/ui';

/**
 * Where a legacy SINGLE_MASTER source points.
 *
 * This is the retired transcoding workflow, kept so episodes made that way stay
 * editable. The field used to offer uploading a file as well as pointing at one
 * already in Drive; uploading through AniZora has been withdrawn, so what is
 * left is the pointer itself.
 *
 * It remains editable on purpose. Hiding the value would leave an operator
 * unable to see or correct the master a legacy episode is built from, and the
 * id would still be saved from form state where nobody could read it.
 */
export function MasterSourceField({
  value,
  onChange,
}: {
  value: string;
  onChange: (driveFileIdOrUrl: string) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-line-soft bg-base/50 p-3">
      <label className="block">
        <Label
          required
          hint="The file this episode's qualities were built from. Paste the share link or the file ID."
        >
          Master Drive link
        </Label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://drive.google.com/file/d/…"
          className={adminInput}
        />
      </label>

      {value ? (
        <p className="mt-2 break-all text-[11.5px] text-ok">Master set: {value.slice(0, 60)}</p>
      ) : (
        <p className="mt-2 text-[11.5px] text-ink-faint">No master set. Paste a Drive link.</p>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Saving queues the episode. A deployed media worker picks it up automatically — nothing else to run.
      </p>
    </div>
  );
}
