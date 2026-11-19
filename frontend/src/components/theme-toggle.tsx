import { Monitor, Moon, Sun } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip="Change theme"
          aria-label={`Change theme (current: ${theme})`}
        >
          <Icon />
          <span className="group-data-[collapsible=icon]:hidden">Theme</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "top" : "right"} align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system")
              setTheme(value);
          }}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
