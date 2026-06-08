import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { Spinner } from "./components/common/Spinner";
import { Layout } from "./components/layout/Layout";
import { OnboardingGate } from "./components/onboarding/OnboardingGate";
import { LocationProvider } from "./context/LocationContext";
import { OffersProvider } from "./context/OffersContext";
import { WalletProvider } from "./context/WalletContext";

const Home = lazy(() => import("./pages/landing/Landing2"));
const Create = lazy(() => import("./pages/Create"));
const OfferDetail = lazy(() => import("./pages/OfferDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const AgentDetail = lazy(() => import("./pages/AgentDetail"));
const Exchange = lazy(() => import("./pages/Exchange"));
const Explore = lazy(() => import("./pages/Explore"));
const ExploreOffers = lazy(() => import("./pages/ExploreOffers"));
const ExploreAgents = lazy(() => import("./pages/ExploreAgents"));
const About = lazy(() => import("./pages/About"));
const TradeDetail = lazy(() => import("./pages/TradeDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <OnboardingGate>
          <LocationProvider>
            <OffersProvider>
              <HashRouter>
                <Layout>
                  <Suspense fallback={<Spinner />}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route
                        path="/offers"
                        element={<Navigate to="/explore/offers" replace />}
                      />
                      <Route path="/offer/:id" element={<OfferDetail />} />
                      <Route path="/create" element={<Create />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/profile/:address" element={<Profile />} />
                      <Route path="/agent/:address" element={<AgentDetail />} />
                      <Route path="/exchange" element={<Exchange />} />
                      <Route path="/explore" element={<Explore />} />
                      <Route
                        path="/explore/offers"
                        element={<ExploreOffers />}
                      />
                      <Route
                        path="/explore/agents"
                        element={<ExploreAgents />}
                      />
                      <Route path="/about" element={<About />} />
                      <Route path="/trades/:id" element={<TradeDetail />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </HashRouter>
            </OffersProvider>
          </LocationProvider>
        </OnboardingGate>
      </WalletProvider>
    </QueryClientProvider>
  );
}
