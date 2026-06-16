import { HashRouter, useLocation } from "react-router-dom"
import { AppBootstrap } from "@/components/app/AppBootstrap"
import { AppWindow } from "@/components/layout/AppWindow"
import { TrayTogglePage } from "@/pages/TrayTogglePage"
import { AppRoutes } from "@/routes/AppRoutes"

function AppShell() {
  const location = useLocation()

  if (location.pathname === "/tray") {
    return <TrayTogglePage />
  }

  return (
    <AppWindow>
      <AppBootstrap>
        <AppRoutes />
      </AppBootstrap>
    </AppWindow>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  )
}
