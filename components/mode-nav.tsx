import Link from "next/link";

/** Switches between the focus (pomodoro) page and the exercise page. */
export function ModeNav({ current }: { current: "focus" | "exercise" }) {
  const item = (mode: "focus" | "exercise", href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === mode ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-cream ${
        current === mode ? "bg-white text-ink shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Mode" className="flex rounded-full bg-black/15 p-1">
      {item("focus", "/", "Focus")}
      {item("exercise", "/exercise", "Exercise")}
    </nav>
  );
}
