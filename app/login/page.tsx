import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#13233f_0%,#08111f_45%,#050b15_100%)] text-white">
          <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
            <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="mb-6">
                <div className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/85">
                  Protected Access
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">
                  Enter Password
                </h1>

                <p className="mt-2 text-sm text-slate-400">
                  Loading login…
                </p>
              </div>

              <div className="space-y-4">
                <div className="h-12 rounded-2xl bg-white/10 animate-pulse" />
                <div className="h-12 rounded-2xl bg-white/10 animate-pulse" />
              </div>
            </div>
          </div>
        </main>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}