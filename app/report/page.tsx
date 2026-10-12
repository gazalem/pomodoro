import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "@/components/icons";
import { ReportClient } from "@/components/report-client";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage() {
  return (
    <div className="min-h-dvh bg-paper text-ink dark:bg-night dark:text-mist">
      <div className="mx-auto max-w-5xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),2rem)] md:px-8">
        <header className="flex items-center gap-3 py-4">
          <Link
            href="/"
            aria-label="Back to timer"
            className="grid size-10 place-items-center rounded-full hover:bg-ink/5 dark:hover:bg-mist/10"
          >
            <ArrowLeftIcon className="text-xl" />
          </Link>
          <h1 className="text-2xl font-semibold">Your report</h1>
        </header>
        {/* useSearchParams needs a Suspense boundary in a static export. */}
        <Suspense fallback={<p className="py-20 text-center text-ink-soft dark:text-mist-soft">Loading report…</p>}>
          <ReportClient />
        </Suspense>
      </div>
    </div>
  );
}
