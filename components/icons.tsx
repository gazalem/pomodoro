import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const StatsIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={3.2}>
    <path d="M5 20v-6M12 20V6M19 20v-9" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
  </Icon>
);

export const RestartIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.6}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <rect x="5" y="4" width="4.5" height="16" rx="0.5" />
    <rect x="14.5" y="4" width="4.5" height="16" rx="0.5" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="0.5" />
  </Icon>
);

export const SkipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 5 8 7-8 7z" />
    <path d="M18 5v14" />
  </Icon>
);

export const WavesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 12c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 17c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
  </Icon>
);

export const FlameIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M12 2c.6 3.2-1.6 4.8-3.3 6.9C7.2 10.7 6 12.6 6 15a6 6 0 0 0 12 0c0-2.2-1-4.1-2.3-5.6-.2 1.4-.9 2.5-2 3.1.5-3.8-.6-7.6-1.7-10.5zm0 18a2.8 2.8 0 0 1-2.8-2.8c0-1.6 1.4-2.6 2.2-4 .6 1.1 3.4 2.3 3.4 4A2.8 2.8 0 0 1 12 20z" />
  </Icon>
);

export const RainIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    {[
      [12, 4], [7, 7], [17, 7], [12, 10], [7, 13], [17, 13], [12, 16], [9.5, 19.5], [14.5, 19.5],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} />
    ))}
  </Icon>
);

export const TreeIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M12 2 6.5 9h2.6L5 14.5h4.5L5.5 19H11v3h2v-3h5.5l-4-4.5H19L14.9 9h2.6z" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const GripIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    {[6, 12, 18].flatMap((cy) => [9, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.7} />))}
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.5}>
    <path d="M5 12h14" />
  </Icon>
);

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={3}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.5}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.5}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const TomatoIcon = (p: IconProps) => (
  <Icon {...p} stroke="none">
    <circle cx="12" cy="13.5" r="8" fill="currentColor" />
    <path d="M12 6.5c-1.2-1.8-3.3-2.2-4.6-1.6 1 .5 1.7 1.3 2 2.3-1.3-.2-2.5.2-3.3 1 1.9.4 3.9.3 5.9-.6 2 .9 4 1 5.9.6-.8-.8-2-1.2-3.3-1 .3-1 1-1.8 2-2.3-1.3-.6-3.4-.2-4.6 1.6z" fill="#4caf50" />
  </Icon>
);
