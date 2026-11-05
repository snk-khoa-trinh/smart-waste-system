import { PrototypeStatus } from "@/components/prototype-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  History,
  FlaskConical,
  UserRound,
  LayoutDashboard,
  Trash2,
  Recycle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/bins", label: "Bins", icon: Trash2 },
  { to: "/records", label: "Records", icon: History },
] as const;
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="icon" role="navigation" aria-label="Main navigation">
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center">
          <Recycle className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:sr-only">
            SWS
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navigation.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  asChild
                  tooltip={label}
                  isActive={
                    to === "/" ? pathname === "/" : pathname.startsWith(to)
                  }
                >
                  <Link
                    to={to}
                    onClick={closeMobile}
                    aria-label={label}
                    aria-current={
                      (to === "/" ? pathname === "/" : pathname.startsWith(to))
                        ? "page"
                        : undefined
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Inference lab"
                isActive={pathname.startsWith("/inference")}
              >
                <Link
                  to="/inference"
                  onClick={closeMobile}
                  aria-label="Inference lab"
                  aria-current={
                    pathname.startsWith("/inference") ? "page" : undefined
                  }
                >
                  <FlaskConical />
                  <span>Inference lab</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="grid grid-cols-2 gap-1 group-data-[collapsible=icon]:grid-cols-1">
              <PrototypeStatus />
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="@snk-khoa-trinh on GitHub">
              <a
                href="https://github.com/snk-khoa-trinh"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="@snk-khoa-trinh on GitHub (opens in a new tab)"
              >
                <UserRound />
                <span>@snk-khoa-trinh</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
