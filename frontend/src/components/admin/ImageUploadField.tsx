'use client';

import { useEffect, useRef, useState } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Label, adminInput } from './ui';

type ImageKind = 'poster' | 'banner' | 'thumbnail' | 'avatar';

interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  kind: ImageKind;
  value: string;
  onChange: (url: string) => void;
  aspect?: string;
  /**
   * Reports upload progress to the parent form, which blocks saving while a
   * file is still in flight — otherwise Save would quietly store the previous
   * image URL.
   */
  onUploadingChange?: (uploading: boolean) => void;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
/** Mirrors the backend default (MAX_UPLOAD_SIZE_MB); the server re-checks. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Mirrors the backend's shape rules so an obviously wrong image is caught
 * before it is uploaded. The server validates again and is authoritative.
 */
const SHAPE: Record<ImageKind, { minWidth: number; minHeight: number; shape: 'portrait' | 'landscape' | 'any'; hint: string }> = {
  poster: { minWidth: 300, minHeight: 420, shape: 'portrait', hint: 'a portrait image, about 2:3 (e.g. 600×900)' },
  banner: { minWidth: 960, minHeight: 300, shape: 'landscape', hint: 'a wide image (e.g. 1600×600 or 1920×1080)' },
  thumbnail: { minWidth: 320, minHeight: 180, shape: 'landscape', hint: 'a 16:9 image (e.g. 1280×720)' },
  avatar: { minWidth: 64, minHeight: 64, shape: 'any', hint: 'at least 64×64' },
};

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('This file could not be read as an image.'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function validate(file: File, kind: ImageKind): Promise<string | null> {
  if (!ACCEPTED.includes(file.type)) return 'Use a JPG, PNG, WebP or AVIF image.';
  if (file.size > MAX_BYTES) return `The image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 15 MB.`;
  try {
    const { width, height } = await readDimensions(file);
    const rule = SHAPE[kind];
    if (width < rule.minWidth || height < rule.minHeight) {
      return `This image is ${width}×${height}. A ${kind} should be ${rule.hint}.`;
    }
    if (rule.shape === 'portrait' && width >= height) return `This image is landscape. A ${kind} should be ${rule.hint}.`;
    if (rule.shape === 'landscape' && height >= width) return `This image is portrait. A ${kind} should be ${rule.hint}.`;
  } catch (e) {
    // AVIF may not decode in every browser; leave that case to the server.
    if (file.type !== 'image/avif') return e instanceof Error ? e.message : 'Could not read this image.';
  }
  return null;
}

/**
 * Upload or paste a URL.
 *
 * Shows a local preview the moment a file is chosen, then swaps to the stored
 * URL once the upload succeeds. Uses a raw fetch rather than the JSON helper
 * because this is multipart — setting Content-Type manually would break the
 * boundary.
 */
export function ImageUploadField({
  label,
  hint,
  kind,
  value,
  onChange,
  aspect = 'aspect-video',
  onUploadingChange,
}: ImageUploadFieldProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  // Release the object URL when it is replaced or the field unmounts.
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  useEffect(() => setBroken(false), [value]);

  const upload = async (file: File) => {
    setError(null);
    const problem = await validate(file, kind);
    if (problem) {
      setError(problem);
      return;
    }

    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const data = new FormData();
      data.append('file', file);

      const response = await fetch(`${PUBLIC_API_URL}/uploads/${kind}`, {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body: data,
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message ?? `Upload failed (${response.status})`);
      }

      const result = (await response.json()) as { url: string };
      onChange(result.url);
      setLocalPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setLocalPreview(null);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const shown = localPreview ?? value;

  return (
    <div data-testid={`image-field-${kind}`}>
      <Label hint={hint}>{label}</Label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          'relative overflow-hidden rounded-lg border-2 border-dashed transition',
          aspect,
          dragging ? 'border-brand bg-brand/10' : 'border-line bg-base',
        )}
      >
        {shown && !broken ? (
          <>
            {/* A plain <img>: previews can be blob: URLs or any pasted host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown}
              alt={`${label} preview`}
              onError={() => setBroken(true)}
              className={cn('absolute inset-0 h-full w-full object-cover', uploading && 'opacity-60')}
            />
            {uploading ? (
              <span className="absolute inset-0 grid place-items-center bg-black/35">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-brand-bright" />
              </span>
            ) : (
              <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="h-7 rounded-lg bg-black/75 px-2.5 text-[11.5px] font-semibold text-ink-soft backdrop-blur-sm transition hover:bg-black hover:text-ink"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => onChange('')}
                  aria-label="Remove image"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-black/75 text-ink-soft backdrop-blur-sm transition hover:bg-danger hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="grid h-full w-full place-items-center px-3 text-center transition hover:bg-white/4"
          >
            <span className="text-[12px] leading-relaxed text-ink-faint">
              {broken ? (
                <span className="text-danger">This image URL could not be loaded.</span>
              ) : null}
              {broken ? <br /> : null}
              Click to upload
              <br />
              or drop an image here
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        aria-label={`Upload ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste a URL"
        aria-label={`${label} URL`}
        className={`${adminInput} mt-2`}
      />

      <p className="mt-1.5 text-[11px] text-ink-faint">JPG, PNG, WebP or AVIF · up to 15 MB · {SHAPE[kind].hint}</p>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
