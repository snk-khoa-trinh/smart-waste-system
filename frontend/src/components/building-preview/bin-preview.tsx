import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Same summary on hover/focus and pinned click/tap; one shared SVG trigger. */
export function BinPreview({
  children,
  content,
  label,
}: {
  children: ReactElement;
  content: ReactNode;
  label: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Popover open={pinned} onOpenChange={setPinned}>
      <TooltipProvider delayDuration={150}>
        <Tooltip open={hovered && !pinned} onOpenChange={setHovered}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            collisionPadding={16}
            className="w-72 max-w-[calc(100vw-2rem)]"
          >
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        aria-label={label}
        side="top"
        collisionPadding={16}
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
