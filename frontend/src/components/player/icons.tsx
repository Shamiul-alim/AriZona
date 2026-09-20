/**
 * Player iconography — original, minimal, stroke-based glyphs drawn inline.
 * Kept in one file so every control shares the same weight and geometry.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M7.5 4.8a1 1 0 0 1 1.52-.85l9.2 6.2a1 1 0 0 1 0 1.7l-9.2 6.2a1 1 0 0 1-1.52-.85V4.8Z" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.3" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.3" />
  </svg>
);

export const ReplayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.36" />
    <path d="M3 4v5h5" />
  </Base>
);

export const VolumeHighIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M16 8.6a5 5 0 0 1 0 6.8" />
    <path d="M18.6 6a8.5 8.5 0 0 1 0 12" />
  </Base>
);

export const VolumeLowIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M16 9.4a4 4 0 0 1 0 5.2" />
  </Base>
);

export const VolumeMuteIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </Base>
);

export const FullscreenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
    <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
    <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Base>
);

export const ExitFullscreenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4" />
    <path d="M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4" />
    <path d="M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20" />
    <path d="M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </Base>
);

export const PipIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <rect x="12.5" y="12" width="6.5" height="5" rx="1.2" fill="currentColor" stroke="none" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V20a1.94 1.94 0 0 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06A1.94 1.94 0 1 1 4.72 16l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H4a1.94 1.94 0 0 1 0-3.88h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A1.94 1.94 0 1 1 8 4.72l.06.06a1.6 1.6 0 0 0 1.77.32H10a1.6 1.6 0 0 0 .97-1.47V4a1.94 1.94 0 0 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06A1.94 1.94 0 1 1 20.4 8l-.06.06a1.6 1.6 0 0 0-.32 1.77V10a1.6 1.6 0 0 0 1.47.97H22a1.94 1.94 0 0 1 0 3.88h-.09a1.6 1.6 0 0 0-1.47.97Z" />
  </Base>
);

export const SubtitlesIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <path d="M7 14.5h4M13.5 14.5H17M7 10.8h2.5M12 10.8h5" />
  </Base>
);

export const NextIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M5 5.6a.9.9 0 0 1 1.38-.76l8.2 5.6a.9.9 0 0 1 0 1.5l-8.2 5.6A.9.9 0 0 1 5 16.8V5.6Z" />
    <rect x="16.4" y="5" width="2.6" height="14" rx="1.1" />
  </svg>
);

export const PrevIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M19 5.6a.9.9 0 0 0-1.38-.76l-8.2 5.6a.9.9 0 0 0 0 1.5l8.2 5.6A.9.9 0 0 0 19 16.8V5.6Z" />
    <rect x="5" y="5" width="2.6" height="14" rx="1.1" />
  </svg>
);

export const Forward10Icon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12.5 4.5a8 8 0 1 0 7.4 5" />
    <path d="M20 3.5v5h-5" />
    <text x="12" y="15.4" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
      10
    </text>
  </Base>
);

export const Back10Icon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11.5 4.5a8 8 0 1 1-7.4 5" />
    <path d="M4 3.5v5h5" />
    <text x="12" y="15.4" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
      10
    </text>
  </Base>
);

export const ServerIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="6.5" rx="1.8" />
    <rect x="3" y="13.5" width="18" height="6.5" rx="1.8" />
    <path d="M7 7.2h.01M7 16.7h.01" />
  </Base>
);

export const TheatreIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
  </Base>
);

export const LightOffIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .85 1.65l.05.55h5.4l.05-.55c.06-.65.35-1.25.85-1.65A6 6 0 0 0 12 3Z" />
    <path d="M9.8 19.5h4.4M10.4 21.5h3.2" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14.5 5 8 12l6.5 7" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 5 16 12l-6.5 7" />
  </Base>
);

export const SpeedIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 17a9 9 0 1 1 16 0" />
    <path d="M12 13.5 16 9" />
    <circle cx="12" cy="14.6" r="1.3" fill="currentColor" stroke="none" />
  </Base>
);

export const AudioIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 14V9.5a8 8 0 0 1 16 0V14" />
    <rect x="2.6" y="13" width="4.4" height="6.4" rx="1.6" />
    <rect x="17" y="13" width="4.4" height="6.4" rx="1.6" />
  </Base>
);

export const WarningIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.6 22 20H2L12 3.6Z" />
    <path d="M12 10v4.2M12 17.3h.01" />
  </Base>
);
