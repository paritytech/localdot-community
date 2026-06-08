import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Compass,
  PlusCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

const CITIES = [
  "Buenos Aires",
  "Lagos",
  "Istanbul",
  "São Paulo",
  "Ho Chi Minh City",
  "Bangkok",
  "Nairobi",
  "Jakarta",
  "Manila",
  "Mexico City",
  "Bogotá",
  "Lima",
  "Accra",
  "Karachi",
  "Dhaka",
  "Cairo",
  "Dar es Salaam",
  "Medellín",
  "Hanoi",
  "Addis Ababa",
  "Kinshasa",
  "Maputo",
  "Yangon",
  "Phnom Penh",
  "Guatemala City",
  "Lusaka",
  "Kampala",
  "Colombo",
];

export default function Landing2(): JSX.Element {
  return (
    <div>
      {/* Hero — cities + headline */}
      <section className="pt-2 md:pt-4 pb-4 md:pb-6 px-4 md:px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {/* City ticker — animated right-to-left */}
          <div className="relative mb-12 -mx-4 md:-mx-6">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-[#0f0f0f] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-[#0f0f0f] to-transparent z-10 pointer-events-none" />

            <div className="overflow-hidden">
              <div
                className="flex gap-2 w-max"
                style={{ animation: "ticker 90s linear infinite" }}
              >
                {[...CITIES, ...CITIES].map((city, i) => (
                  <span
                    key={`${city}-${i}`}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full border border-stone-800 text-xs text-stone-600 whitespace-nowrap"
                  >
                    {city}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
            <h1 className="mb-4">
              Cash to digital dollars,
              <br />
              <em className="italic text-stone-400">without a reseller.</em>
            </h1>
            <p className="text-base text-stone-500 mb-8">
              Every trade is protected by on-chain escrow.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {/* Main CTAs — Deposit & Withdraw */}
              <Link
                to="/exchange"
                state={{ mode: "deposit" }}
                className="group flex-1 sm:flex-initial sm:w-56 p-5 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-green-500/30 hover:bg-stone-800/60 transition-all text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-500/10 text-green-400 group-hover:bg-green-500/15 transition-all flex-shrink-0">
                    <ArrowDownToLine className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium text-stone-100 group-hover:text-white transition-colors">
                    Deposit cash
                  </p>
                </div>
                <p className="text-xs text-stone-500 group-hover:text-stone-400 transition-colors">
                  Convert cash to digital dollars in minutes.
                </p>
                <span className="inline-block mt-2 text-xs text-green-400/70 group-hover:text-green-400 transition-colors">
                  Start a deposit →
                </span>
              </Link>
              <Link
                to="/exchange"
                state={{ mode: "withdraw" }}
                className="group flex-1 sm:flex-initial sm:w-56 p-5 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-amber-500/30 hover:bg-stone-800/60 transition-all text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15 transition-all flex-shrink-0">
                    <ArrowUpFromLine className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium text-stone-100 group-hover:text-white transition-colors">
                    Withdraw cash
                  </p>
                </div>
                <p className="text-xs text-stone-500 group-hover:text-stone-400 transition-colors">
                  Get cash from your digital dollars, safely.
                </p>
                <span className="inline-block mt-2 text-xs text-amber-400/70 group-hover:text-amber-400 transition-colors">
                  Start a withdrawal →
                </span>
              </Link>
            </div>

            {/* Secondary links */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <Link
                to="/explore"
                className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-300 transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                Explore →
              </Link>
              <Link
                to="/create"
                className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-300 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Create →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-10 md:py-14 px-4 md:px-6 border-t border-stone-800 bg-stone-950">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl mb-3 text-center">
            How it works
          </h2>
          <p className="text-sm text-stone-500 text-center mb-12 max-w-lg mx-auto">
            Four steps. Your money is protected before anyone meets in person.
          </p>

          {/* Four-step visual flow */}
          <div className="rounded-xl border border-stone-800 bg-stone-900 p-6 md:p-10">
            <div className="relative">
              {/* Desktop: gradient connecting line through icon centers */}
              <div
                className="hidden md:block absolute top-7 left-[12.5%] right-[12.5%] h-px"
                style={{
                  background:
                    "linear-gradient(to right, rgba(214, 211, 209, 0.2), rgba(245, 158, 11, 0.3), rgba(168, 162, 158, 0.2), rgba(34, 197, 94, 0.3))",
                }}
              />

              <div className="grid md:grid-cols-4 gap-10 md:gap-5">
                {/* Step 1 — Find a provider */}
                <div className="flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center">
                  <div className="relative z-10 w-14 h-14 flex-shrink-0 rounded-full bg-stone-800/80 border border-stone-700 flex items-center justify-center md:mb-5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#d6d3d1"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-widest font-medium mb-2">
                      Find a provider
                    </p>
                    <p className="text-sm font-medium text-stone-200 mb-1.5">
                      Pick an offer
                    </p>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      Browse open offers by city, amount, and rate. Find one
                      that works for you and select it.
                    </p>
                  </div>
                </div>

                {/* Step 2 — Money gets locked */}
                <div className="flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center">
                  <div className="relative z-10 w-14 h-14 flex-shrink-0 rounded-full bg-[#322616] border border-amber-500/20 flex items-center justify-center md:mb-5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 018 0v4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-500/60 uppercase tracking-widest font-medium mb-2">
                      Before you meet
                    </p>
                    <p className="text-sm font-medium text-stone-200 mb-1.5">
                      Money gets locked
                    </p>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      The provider accepts and their digital dollars are locked
                      in escrow. You can see the locked funds on your screen
                      before you go anywhere.
                    </p>
                  </div>
                </div>

                {/* Step 3 — Meet in person */}
                <div className="flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center">
                  <div className="relative z-10 w-14 h-14 flex-shrink-0 rounded-full bg-stone-800 border border-stone-600 flex items-center justify-center md:mb-5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a8a29e"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 uppercase tracking-widest font-medium mb-2">
                      The meetup
                    </p>
                    <p className="text-sm font-medium text-stone-200 mb-1.5">
                      Exchange cash in person
                    </p>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      Go to the agent location. Hand over cash, the agent
                      verifies the amount and releases tokens to you.
                    </p>
                  </div>
                </div>

                {/* Step 4 — Both confirm */}
                <div className="flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center">
                  <div className="relative z-10 w-14 h-14 flex-shrink-0 rounded-full bg-[#1d2a1e] border border-green-500/20 flex items-center justify-center md:mb-5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l3 3 5-5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-green-500/60 uppercase tracking-widest font-medium mb-2">
                      Confirmation
                    </p>
                    <p className="text-sm font-medium text-stone-200 mb-1.5">
                      Tokens released, trade complete
                    </p>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      Agent confirms the cash, tokens release to you instantly.
                      Provider picks up cash from the agent.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Safety net */}
          <div className="mt-4 rounded-xl border border-stone-800 bg-stone-900 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-stone-800 flex items-center justify-center mt-0.5">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#78716c"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-300 mb-1">
                  What if something goes wrong?
                </p>
                <p className="text-sm text-stone-500 leading-relaxed">
                  If either person doesn't show up, or nobody confirms the
                  exchange, the locked funds automatically return to the
                  provider after 24 hours. The trade cancels itself. Nobody gets
                  stuck.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
