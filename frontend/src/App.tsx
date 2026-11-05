import { DataStatusFooter } from "@/components/data-status-footer";
import { useState } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function App() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = pathname.startsWith("/bins")
    ? "Bins"
    : pathname.startsWith("/records")
      ? "Records"
      : pathname.startsWith("/inference")
        ? "Inference lab"
        : "Overview";
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("loop-sidebar") !== "collapsed";
    } catch {
      return true;
    }
  });
  function changeSidebar(open: boolean) {
    setSidebarOpen(open);
    try {
      localStorage.setItem("loop-sidebar", open ? "expanded" : "collapsed");
    } catch {
      /* Preference lasts this session. */
    }
  }
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={changeSidebar}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">{title}</span>
          </div>
        </header>
        <main
          id="main-content"
          className="page-content"
          tabIndex={-1}
          key={pathname}
        >
          <Outlet />
        </main>
        <DataStatusFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
