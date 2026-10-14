export type DashboardLayout = "list" | "cards"

export const DASHBOARD_LAYOUT_STORAGE_KEY = "conet-dashboard-layout"

export function readDashboardLayout(): DashboardLayout {
  if (typeof window === "undefined") return "list"
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)
    return raw === "cards" ? "cards" : "list"
  } catch {
    return "list"
  }
}

export function writeDashboardLayout(layout: DashboardLayout) {
  try {
    window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, layout)
  } catch {
    /* ignore */
  }
}
