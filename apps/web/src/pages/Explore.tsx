import { FileText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useOffersContext } from "../context/OffersContext";
import { useP2PMarket } from "../hooks/useP2PMarket";

export default function Scout(): JSX.Element {
  const { offers } = useOffersContext();
  const { getAllAgents } = useP2PMarket();
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    getAllAgents().then((agents) => setAgentCount(agents.length));
  }, [getAllAgents]);

  return (
    <div className="max-w-lg mx-auto px-4 py-12 md:py-20">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-serif mb-3">Explore</h1>
        <p className="text-stone-500 text-sm">
          Browse all listings, compare prices, fees and availability
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Explore Offers */}
        <Link
          to="/explore/offers"
          className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-green-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-green-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 text-green-400 group-hover:bg-green-500/15 group-hover:scale-105 transition-all flex-shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                Offers
              </h2>
              <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                See who's buying and selling, their prices and schedule
              </p>
              <span className="inline-block mt-2.5 text-[11px] text-green-400/70 bg-green-500/10 rounded-full px-2.5 py-0.5 group-hover:text-green-400 group-hover:bg-green-500/15 transition-colors">
                {offers.length} active{" "}
                {offers.length === 1 ? "offer" : "offers"}
              </span>
            </div>
          </div>
        </Link>

        {/* Explore Agents */}
        <Link
          to="/explore/agents"
          className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-amber-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-amber-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15 group-hover:scale-105 transition-all flex-shrink-0">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                Agents
              </h2>
              <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                Browse registered agents, their locations and fees
              </p>
              <span className="inline-block mt-2.5 text-[11px] text-amber-400/70 bg-amber-500/10 rounded-full px-2.5 py-0.5 group-hover:text-amber-400 group-hover:bg-amber-500/15 transition-colors">
                {agentCount} registered {agentCount === 1 ? "agent" : "agents"}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
