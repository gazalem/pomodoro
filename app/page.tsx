import { io } from "next/cache";
import { Suspense } from "react";
import { PomodoroApp } from "@/components/pomodoro-app";
import { getSettings, listTasks } from "@/lib/repo";

export default function Home() {
  return (
    <Suspense fallback={<AppShell />}>
      <LoadedApp />
    </Suspense>
  );
}

async function LoadedApp() {
  await io(); // node:sqlite is synchronous: keep these reads out of the static shell
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return <PomodoroApp initialSettings={getSettings()} initialTasks={listTasks(startOfDay.getTime())} />;
}

/** Static placeholder with the same silhouette as the timer, shown while data loads. */
function AppShell() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <div className="aspect-square w-[min(84vw,46dvh,440px)] rounded-full border-[6px] border-salmon" />
    </div>
  );
}
