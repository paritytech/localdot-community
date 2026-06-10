import { ArrowRight, Lock, Shield, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

export default function About(): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <h1 className="text-2xl font-serif text-stone-50 mb-2">About LocalDOT</h1>
      <p className="text-stone-400 mb-8">
        A peer-to-peer marketplace for cash-to-crypto exchange, built entirely
        on Polkadot.
      </p>

      <div className="space-y-6">
        <Section icon={<Users className="w-5 h-5" />} title="What is LocalDOT?">
          <p>
            LocalDOT connects buyers and sellers for in-person cash trades.
            Whether you want to buy stablecoins with cash or sell your crypto
            for local currency, LocalDOT makes it simple and secure.
          </p>
          <p>
            No bank accounts required. No KYC. Just peer-to-peer trades
            protected by smart contract escrow.
          </p>
        </Section>

        <Section icon={<Wallet className="w-5 h-5" />} title="How Escrow Works">
          <ol className="list-decimal list-inside space-y-2 text-stone-300">
            <li>
              <strong className="text-stone-100">Browse offers</strong> - Find a
              provider selling or buying tokens in your area
            </li>
            <li>
              <strong className="text-stone-100">Request trade</strong> - Choose
              an offer, pick an agent, and send a request
            </li>
            <li>
              <strong className="text-stone-100">Provider accepts</strong> -
              Provider locks tokens in escrow on-chain
            </li>
            <li>
              <strong className="text-stone-100">Fund escrow</strong> - Provider
              locks tokens in the smart contract
            </li>
            <li>
              <strong className="text-stone-100">Meet in person</strong> -
              Exchange cash for the agreed amount
            </li>
            <li>
              <strong className="text-stone-100">Confirm handover</strong> -
              parties confirm, escrow releases tokens to buyer
            </li>
          </ol>
          <p className="mt-3 text-sm text-stone-500">
            If no confirmation within 24 hours, the provider can claim a timeout
            refund.
          </p>
        </Section>

        <Section icon={<Lock className="w-5 h-5" />} title="Privacy Model">
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500 mt-2 flex-shrink-0" />
              <span>
                <strong className="text-stone-100">No KYC</strong> - Trade with
                just a wallet, no identity documents
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500 mt-2 flex-shrink-0" />
              <span>
                <strong className="text-stone-100">Contextual aliases</strong> -
                Your identity is tied to your wallet address only
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500 mt-2 flex-shrink-0" />
              <span>
                <strong className="text-stone-100">100% on-chain</strong> - All
                data stored on Polkadot, no centralized servers
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500 mt-2 flex-shrink-0" />
              <span>
                <strong className="text-stone-100">Encrypted photos</strong> -
                Profile photos are encrypted at rest on Bulletin Chain
              </span>
            </li>
          </ul>
        </Section>

        <Section icon={<Shield className="w-5 h-5" />} title="Safety Tips">
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <span>
                Meet in well-lit public places like coffee shops or shopping
                centers
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <span>
                Start with smaller amounts until you build trust with a
                counterparty
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <span>Verify the escrow is funded before handing over cash</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <span>
                Use an agent for larger trades — they provide insurance
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <span>
                Confirm the handover only after you have received and verified
                the cash
              </span>
            </li>
          </ul>
        </Section>
      </div>

      <div className="mt-10 p-6 rounded-lg border border-stone-700 bg-stone-800/50 text-center">
        <p className="text-stone-300 mb-4">Ready to start trading?</p>
        <div className="flex justify-center gap-3">
          <Link to="/explore" className="btn-ghost text-sm">
            Browse Offers
          </Link>
          <Link
            to="/create"
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            Create Offer
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-stone-400">{icon}</div>
        <h2 className="text-lg font-medium text-stone-100">{title}</h2>
      </div>
      <div className="text-stone-400 space-y-3">{children}</div>
    </div>
  );
}
