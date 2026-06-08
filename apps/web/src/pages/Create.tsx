import { ArrowLeft, FileText, UserPlus } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { Spinner } from "../components/common/Spinner";

const CreateListing = lazy(() => import("./CreateListing"));
const RegisterAgent = lazy(() => import("./RegisterAgent"));

type Mode = null | "offer" | "agent";

export default function Create(): JSX.Element {
  const [mode, setMode] = useState<Mode>(null);

  // ─── LANDING VIEW ────────────────────────────────────────
  if (!mode) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-serif mb-3">Create</h1>
          <p className="text-stone-500 text-sm">
            List your offer or start earning as an exchange agent
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Create Offer */}
          <button
            onClick={() => setMode("offer")}
            className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-green-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-green-500/5 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 text-green-400 group-hover:bg-green-500/15 group-hover:scale-105 transition-all flex-shrink-0">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                  Create Offer
                </h2>
                <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                  Set your price, location and hours. Buyers will find you
                </p>
              </div>
            </div>
          </button>

          {/* Register Agent */}
          <button
            onClick={() => setMode("agent")}
            className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-amber-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-amber-500/5 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15 group-hover:scale-105 transition-all flex-shrink-0">
                <UserPlus className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                  Register Agent
                </h2>
                <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                  Facilitate trades at your location, earn a fee each time
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── ACTIVE MODE ─────────────────────────────────────────
  // The forms own their own title + subtitle and span the wide split layout, so
  // the hub only contributes a back link here.
  return (
    <div>
      <div className="mx-auto max-w-[1180px] px-4 pt-6 md:px-6 md:pt-8 lg:px-8">
        <button
          onClick={() => setMode(null)}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm text-stone-500 transition-colors hover:text-stone-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <Suspense fallback={<Spinner />}>
        {mode === "offer" ? <CreateListing /> : <RegisterAgent />}
      </Suspense>
    </div>
  );
}
