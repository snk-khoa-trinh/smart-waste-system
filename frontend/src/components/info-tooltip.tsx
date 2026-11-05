import { useState } from "react";
import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function InfoTooltip({
  label,
  children,
  size = "icon",
}: {
  label: string;
  children: ReactNode;
  size?: "icon" | "icon-sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label={label}
          onClick={(event) => {
            event.preventDefault();
            setOpen(!open);
          }}
        >
          <CircleAlert className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{children}</TooltipContent>
    </Tooltip>
  );
}
