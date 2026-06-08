import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Clock,
  Link2,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Offer } from "../../../types/offers";
import { EmptyState } from "../../common/EmptyState";
import {
  FilterChip,
  KeyboardHints,
  SortableHeader,
  type SortDir,
  useRowKeyboardNav,
} from "../../common/ListTable";
import { Pill } from "../../common/Pill";

type OfferFilter = "all" | "selling" | "buying";
type OfferSortKey = "amount" | "type" | "created" | null;

/** Grid template shared by the offers header and body rows. */
const OFFER_TABLE_COLS = "grid-cols-[150px_120px_1fr_120px_150px_28px]";

export function OffersTab({ offers }: { offers: Offer[] }): JSX.Element {
  const navigate = useNavigate();

  if (offers.length === 0) {
    return (
      <EmptyState
        compact
        icon={Plus}
        title="No active offers"
        description="Create an offer to start trading."
        action={{ label: "Create Offer", to: "/create" }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-stone-100 text-base font-medium">My offers</h2>
          <p className="text-stone-500 text-xs mt-1">
            Live offers you've published — still open for trade requests.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 px-2 py-1 rounded-md border border-stone-800">
          {offers.length} live
        </span>
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
        <MyOffersTable offers={offers} />
      </div>

      {/* Mobile/tablet: card grid */}
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            onClick={() => navigate(`/offer/${offer.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Desktop offers table — role filters, kbd nav, sortable cols ─────────────

function MyOffersTable({ offers }: { offers: Offer[] }): JSX.Element {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<OfferFilter>("all");
  const [sort, setSort] = useState<{ key: OfferSortKey; dir: SortDir }>({
    key: "created",
    dir: "asc",
  });

  const counts = useMemo(() => {
    return {
      all: offers.length,
      selling: offers.filter((o) => o.role === "seller").length,
      buying: offers.filter((o) => o.role === "buyer").length,
    };
  }, [offers]);

  const filtered = useMemo(() => {
    const matchFilter = (o: Offer) => {
      if (filter === "all") return true;
      if (filter === "selling") return o.role === "seller";
      if (filter === "buying") return o.role === "buyer";
      return true;
    };
    const arr = offers.filter(matchFilter);
    if (sort.key === "amount") {
      arr.sort((a, b) => parseFloat(b.maxAmount) - parseFloat(a.maxAmount));
    } else if (sort.key === "type") {
      arr.sort((a, b) => a.role.localeCompare(b.role));
    } else if (sort.key === "created") {
      // Offer ids are sequential, so they double as a creation-order key
      // (createdAt is a pre-formatted display string, not sortable).
      arr.sort((a, b) => Number(b.id) - Number(a.id));
    }
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [offers, filter, sort]);

  const openOffer = useCallback(
    (o: Offer) => navigate(`/offer/${o.id}`),
    [navigate],
  );
  const [focused, setFocused] = useRowKeyboardNav(filtered, openOffer);

  const setSortKey = (key: Exclude<OfferSortKey, null>) => {
    setSort((s) => {
      return {
        key,
        dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
      };
    });
  };

  return (
    <div>
      {/* Toolbar — role filter chips + keyboard hints */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <FilterChip
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Selling"
            count={counts.selling}
            active={filter === "selling"}
            onClick={() => setFilter("selling")}
          />
          <FilterChip
            label="Buying"
            count={counts.buying}
            active={filter === "buying"}
            onClick={() => setFilter("buying")}
          />
        </div>
        <KeyboardHints />
      </div>

      <div className="rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
        {/* Header row */}
        <div
          className={`grid ${OFFER_TABLE_COLS} items-center gap-4 px-5 py-2.5 border-b border-stone-900 bg-stone-950/40`}
        >
          <SortableHeader
            label="Amount"
            active={sort.key === "amount"}
            dir={sort.dir}
            onSort={() => setSortKey("amount")}
          />
          <SortableHeader
            label="Type"
            active={sort.key === "type"}
            dir={sort.dir}
            onSort={() => setSortKey("type")}
          />
          <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
            Location
          </span>
          <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
            Agents
          </span>
          <SortableHeader
            label="Created"
            active={sort.key === "created"}
            dir={sort.dir}
            onSort={() => setSortKey("created")}
          />
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-stone-500">
            No offers match this filter.
          </div>
        )}
        {filtered.map((offer, i) => (
          <OfferTableRow
            key={offer.id}
            offer={offer}
            isFirst={i === 0}
            isFocused={i === focused}
            onHover={() => setFocused(i)}
          />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-stone-600">
        Showing {filtered.length} of {offers.length} offers.
      </p>
    </div>
  );
}

function OfferTableRow({
  offer,
  isFirst,
  isFocused,
  onHover,
}: {
  offer: Offer;
  isFirst: boolean;
  isFocused: boolean;
  onHover: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const agentCount = offer.agentAddresses.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/offer/${offer.id}`)}
      onMouseEnter={onHover}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/offer/${offer.id}`);
        }
      }}
      className={`group relative grid ${OFFER_TABLE_COLS} items-center gap-4 px-5 py-3.5 text-sm cursor-pointer focus:outline-none transition-colors ${
        isFocused ? "bg-stone-900/70" : "hover:bg-stone-900/50"
      } ${isFirst ? "" : "border-t border-stone-900"}`}
    >
      {isFocused && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-stone-100" />
      )}
      <div className="min-w-0">
        <p className="flex items-baseline gap-1">
          <span className="mono text-base text-stone-100 font-medium tabular-nums">
            {offer.minAmount}–{offer.maxAmount}
          </span>
          <span className="mono text-[10px] uppercase tracking-wider text-stone-500">
            {offer.fiatCurrency}
          </span>
        </p>
        <p className="text-stone-500 text-xs mt-0.5 truncate">
          <span className="mono text-stone-600">#{offer.id}</span>
          {offer.fee && (
            <span className="text-stone-500"> · {offer.fee} fee</span>
          )}
        </p>
      </div>
      <div>
        <OfferTypeBadge role={offer.role} />
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1.5 text-stone-200">
          <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span className="truncate">{offer.city || "Anywhere"}</span>
        </div>
        {offer.country && (
          <p className="mt-0.5 text-xs text-stone-500 truncate">
            {offer.country}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-stone-300">
        {agentCount > 0 ? (
          <>
            <Link2 className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span>
              {agentCount} agent{agentCount > 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <>
            <Users className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span className="text-stone-400">Direct</span>
          </>
        )}
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1.5 text-stone-300">
          <Clock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span className="truncate">{offer.createdAt}</span>
        </div>
      </div>
      <div className="flex justify-end">
        <ChevronRight className="w-4 h-4 text-stone-600 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-400" />
      </div>
    </div>
  );
}

function OfferTypeBadge({ role }: { role: Offer["role"] }): JSX.Element {
  // App-wide convention (see offers/MapView): SELL/Selling = green, BUY/Buying
  // = amber. Matches the Deposit (green) / Withdraw (amber) colour pairing.
  const selling = role === "seller";
  return (
    <Pill
      variant="badge"
      tone={selling ? "emerald" : "amber"}
      label={selling ? "Selling" : "Buying"}
      icon={selling ? ArrowUpRight : ArrowDownLeft}
    />
  );
}

/** One offer card for the mobile/tablet grid. */
function OfferCard({
  offer,
  onClick,
}: {
  offer: Offer;
  onClick: () => void;
}): JSX.Element {
  const agentCount = offer.agentAddresses.length;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full text-left rounded-2xl border border-stone-800 bg-stone-900/60 hover:bg-stone-900 hover:border-stone-700 transition-colors p-4 group relative cursor-pointer focus:outline-none focus:border-stone-700"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="mono text-lg text-stone-100 font-medium tabular-nums">
              {offer.minAmount}–{offer.maxAmount}
            </span>
            <span className="text-stone-500 text-xs">{offer.fiatCurrency}</span>
            <span className="ml-1">
              <OfferTypeBadge role={offer.role} />
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            <span className="mono text-stone-600">#{offer.id}</span>
            {offer.fee && <span> · {offer.fee} fee</span>}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 mt-0.5 shrink-0" />
      </div>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <span className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span className="truncate">{offer.city || "Anywhere"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {agentCount > 0 ? (
            <>
              <Link2 className="w-3.5 h-3.5 text-stone-500" />
              {agentCount} agent{agentCount > 1 ? "s" : ""}
            </>
          ) : (
            <>
              <Users className="w-3.5 h-3.5 text-stone-500" />
              Direct
            </>
          )}
        </span>
      </div>
    </div>
  );
}
