import { BrowserRouter } from "react-router-dom"
import { AppBootstrap } from "@/components/app/AppBootstrap"
import { AppWindow } from "@/components/layout/AppWindow"
import { AppRoutes } from "@/routes/AppRoutes"

export default function App() {
  return (
    <BrowserRouter>
      <AppWindow>
        <AppBootstrap>
          <AppRoutes />
        </AppBootstrap>
      </AppWindow>
    </BrowserRouter>
  )
}
