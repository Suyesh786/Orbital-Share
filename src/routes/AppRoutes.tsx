import { AnimatePresence } from "framer-motion"
import { Routes, Route, useLocation } from "react-router-dom"
import { SessionGuard } from "@/components/routing/SessionGuard"
import { PageTransition } from "@/components/layout/PageTransition"
import {
  canAccessDiscovery,
  canAccessSelect,
  canAccessTransfer,
  canAccessWaiting,
  restoreDiscoverySession,
  restoreSelectSession,
  restoreWaitingSession,
} from "@/lib/sessionGuards"
import { HomePage } from "@/pages/HomePage"
import { SelectFilesPage } from "@/pages/SelectFilesPage"
import { DiscoveryPage } from "@/pages/DiscoveryPage"
import { WaitingPage } from "@/pages/WaitingPage"
import { TransferPage } from "@/pages/TransferPage"

export function AppRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageTransition className="h-full">
              <HomePage />
            </PageTransition>
          }
        />
        <Route
          path="/select"
          element={
            <SessionGuard allow={canAccessSelect} onAllowed={restoreSelectSession}>
              <PageTransition className="h-full">
                <SelectFilesPage />
              </PageTransition>
            </SessionGuard>
          }
        />
        <Route
          path="/discovery"
          element={
            <SessionGuard
              allow={canAccessDiscovery}
              onAllowed={restoreDiscoverySession}
            >
              <PageTransition className="h-full">
                <DiscoveryPage />
              </PageTransition>
            </SessionGuard>
          }
        />
        <Route
          path="/waiting"
          element={
            <SessionGuard allow={canAccessWaiting} onAllowed={restoreWaitingSession}>
              <PageTransition className="h-full">
                <WaitingPage />
              </PageTransition>
            </SessionGuard>
          }
        />
        <Route
          path="/transfer"
          element={
            <SessionGuard allow={canAccessTransfer}>
              <PageTransition className="h-full">
                <TransferPage />
              </PageTransition>
            </SessionGuard>
          }
        />
      </Routes>
    </AnimatePresence>
  )
}
