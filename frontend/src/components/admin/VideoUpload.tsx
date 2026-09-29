'use client';

import { useId, useRef, useState } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

/**
 * Sends one video file to the API, which streams it on into storage.
 *
 * It goes straight to the API rather than through Next.js: a serverless
 * function is the wrong place for a 400MB body, and the platform would reject
 * it long before storage saw it. XHR rather than fetch because it is still the
 * only way to get upload progress.
 */
export function uploadVideoFile(
  file: File,
  options: {
    token: string | null;
    episodeId?: string;
    /** Distinguishes several files of one episode, e.g. the 720p from the 1080p. */
    suffix?: string;
    onProgress: (percent: number) => void;
  },
): Promise<{ driveFileId: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const query = new URLSearchParams({
      filename: file.name,
      ...(options.episodeId ? { episodeId: options.episodeId } : {}),
      ...(options.suffix ? { suffix: options.suffix } : {}),
    });
    request.open('POST', `${PUBLIC_API_URL}/admin/media/masters?${query.toString()}`);
    request.setRequestHeader('authorization', `Bearer ${options.token ?? ''}`);
    request.setRequestHeader('content-type', 'application/octet-stream');

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as { driveFileId: string });
      } else {
        let message = `Upload failed (${request.status})`;
        try {
          message = (JSON.parse(request.responseText) as { message?: string }).message ?? message;
        } catch {
          /* keep the status */
        }
        reject(new Error(message));
      }
    };
    request.onerror = () => reject(new Error('The upload could not reach the server.'));
    // The File is the body: no multipart wrapper, nothing buffered in the page.
    request.send(file);
  });
}

/**
 * A compact upload control, for a row that already has its own label.
 *
 * Shows its own progress and its own error, so one failed quality does not
 * disturb the others on the page.
 */
export function UploadButton({
  onUploaded,
  episodeId,
  suffix,
  label = 'Upload',
}: {
  onUploaded: (driveFileId: string) => void;
  episodeId?: string;
  suffix?: string;
  label?: string;
}) {
  const id = useId();
  const token = useAuthStore((s) => s.accessToken);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = percent !== null;

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="video/*,.mkv,.mp4,.m4v,.mov,.webm,.ts,.avi"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError(null);
          setPercent(0);
          try {
            const { driveFileId } = await uploadVideoFile(file, {
              token,
              episodeId,
              suffix,
              onProgress: setPercent,
            });
            onUploaded(driveFileId);
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
          } finally {
            setPercent(null);
          }
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'whitespace-nowrap rounded-lg border border-line-soft px-3 py-2 text-[12.5px] text-ink-muted transition',
          busy ? 'opacity-70' : 'hover:bg-white/5 hover:text-ink',
        )}
      >
        {busy ? `${percent}%` : label}
      </button>
      {error ? <span className="mt-1 max-w-44 text-[11px] leading-tight text-danger">{error}</span> : null}
    </div>
  );
}
