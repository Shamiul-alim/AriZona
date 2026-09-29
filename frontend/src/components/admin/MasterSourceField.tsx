'use client';

import { useId, useRef, useState } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Label, adminInput } from '@/components/admin/ui';

/**
 * Where a SINGLE_MASTER source gets its master: upload a file, or point at one
 * already in Drive.
 *
 * Both produce the same thing — a Drive file id on the source — so they feed
 * one pipeline rather than two that can drift apart.
 *
 * The upload goes straight to the API and streams from there into storage. It
 * deliberately does not go through the Next.js server: a serverless function
 * is the wrong place for a 400MB body, and the platform would reject it long
 * before storage saw it. XHR is used rather than fetch because it is still the
 * only way to get upload progress.
 */
export function MasterSourceField({
  value,
  onChange,
  episodeId,
}: {
  value: string;
  onChange: (driveFileIdOrUrl: string) => void;
  episodeId?: string;
}) {
  const id = useId();
  const token = useAuthStore((s) => s.accessToken);
  const [mode, setMode] = useState<'upload' | 'link'>(value ? 'link' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = () => {
    if (!file) return;
    setError(null);
    setPercent(0);

    const request = new XMLHttpRequest();
    const query = new URLSearchParams({ filename: file.name, ...(episodeId ? { episodeId } : {}) });
    request.open('POST', `${PUBLIC_API_URL}/admin/media/masters?${query.toString()}`);
    request.setRequestHeader('authorization', `Bearer ${token ?? ''}`);
    request.setRequestHeader('content-type', 'application/octet-stream');

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setPercent(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const body = JSON.parse(request.responseText) as { driveFileId: string };
        onChange(body.driveFileId);
        setPercent(100);
      } else {
        let message = `Upload failed (${request.status})`;
        try {
          message = (JSON.parse(request.responseText) as { message?: string }).message ?? message;
        } catch {
          /* keep the status */
        }
        setError(message);
        setPercent(null);
      }
    };
    request.onerror = () => {
      setError('The upload could not reach the server.');
      setPercent(null);
    };
    // The File is the body: no multipart wrapper, nothing buffered in the page.
    request.send(file);
  };

  const uploading = percent !== null && percent < 100;

  return (
    <div className="mt-3">
      <Label required hint="One file. Everything else — qualities, audio tracks, subtitles — is built from it.">
        Master source
      </Label>

      <div className="mt-1.5 flex flex-wrap gap-2">
        {(
          [
            { key: 'upload', label: 'Upload file' },
            { key: 'link', label: 'Existing Drive link' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={mode === option.key}
            disabled={uploading}
            onClick={() => setMode(option.key)}
            className={cn(
              'rounded-lg border px-3 py-2 text-[12.5px] transition disabled:opacity-50',
              mode === option.key
                ? 'border-brand/60 bg-brand/15 font-semibold text-ink'
                : 'border-line-soft text-ink-muted hover:bg-white/5 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div className="mt-3">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="video/*,.mkv,.mp4,.m4v,.mov,.webm,.ts,.avi"
            disabled={uploading}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPercent(null);
              setError(null);
            }}
            className="block w-full text-[12.5px] text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-surface-3"
          />

          {file ? (
            <p className="mt-2 text-[12px] text-ink-soft">
              {file.name} · {(file.size / 1024 ** 2).toFixed(0)} MB
            </p>
          ) : null}

          {percent !== null ? (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-[11.5px] text-ink-faint">
                {percent < 100 ? `Uploading master… ${percent}%` : 'Master uploaded. Save the episode to queue processing.'}
              </p>
            </div>
          ) : null}

          {file && percent === null ? (
            <button
              type="button"
              onClick={upload}
              className="mt-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
            >
              Upload
            </button>
          ) : null}
        </div>
      ) : (
        <label className="mt-3 block">
          <Label hint="Paste the share link or the file ID of a master already in Drive.">Drive link</Label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://drive.google.com/file/d/…"
            className={adminInput}
          />
        </label>
      )}

      {value ? (
        <p className="mt-2 break-all text-[11.5px] text-ok">Master set: {value.slice(0, 60)}</p>
      ) : (
        <p className="mt-2 text-[11.5px] text-ink-faint">No master yet. Upload a file or paste a Drive link.</p>
      )}

      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Saving queues the episode. A deployed media worker picks it up automatically — nothing else to run.
      </p>
    </div>
  );
}
