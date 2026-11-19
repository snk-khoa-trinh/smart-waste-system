import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** One fill summary opened by click, tap, or keyboard activation. */
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
  return (
    <Popover open={pinned} onOpenChange={setPinned}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
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
