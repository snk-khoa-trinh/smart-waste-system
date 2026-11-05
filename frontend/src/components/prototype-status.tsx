import { InfoTooltip } from "@/components/info-tooltip";
import { Cpu } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAPI, date } from "@/lib/dashboard";
import type { Summary } from "@/lib/dashboard";
import type { Station } from "@/api";
const prototypeId = "s11";
function PrototypeDetails() {
  const stations = useAPI<Station[]>("/stations");
  const readiness = useAPI<{ status: string }>("/ready");
  const summary = useAPI<Summary>("/summary");
  const prototype = stations.data?.find(
    (station) => station.id === prototypeId,
  );
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2
            id="prototype-status-title"
            tabIndex={-1}
            className="text-sm font-semibold"
          >
            Prototype status
          </h2>
          <InfoTooltip label="About hardware status">
            Board status comes from backend heartbeats. Refreshes every 5
            seconds while open.
          </InfoTooltip>
        </div>
        <p className="text-xs text-muted-foreground">
          {prototype?.name || "Prototype bin"} · {prototypeId.toUpperCase()}
        </p>
      </div>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Backend</dt>
          <dd>
            {readiness.isPending
              ? "Checking…"
              : readiness.isError || readiness.data?.status !== "ready"
                ? "Unavailable"
                : "Ready"}
          </dd>
        </div>
        {(
          [
            { role: "fill_monitor", label: "Brain (ESP32)" },
            { role: "camera_sorter", label: "Camera (ESP32-CAM)" },
          ] as const
        ).map(({ role, label }) => {
          const device = prototype?.devices.find(
            (device) => device.role === role,
          );
          const unavailable = stations.isError || !device;
          return (
            <div key={role}>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd
                  className={
                    !unavailable && !stations.isPending && device?.online
                      ? "online"
                      : ""
                  }
                >
                  {stations.isPending
                    ? "Checking…"
                    : unavailable
                      ? "Unavailable"
                      : device.online
                        ? "Online"
                        : device.last_seen
                          ? "Offline"
                          : "No heartbeat"}
                </dd>
              </div>
              {device?.last_seen && !stations.isError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last heartbeat: {date(device.last_seen)}
                </p>
              )}
            </div>
          );
        })}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Inference provider</dt>
          <dd>
            {summary.isError
              ? "Unavailable"
              : summary.data?.inference_provider || "Checking…"}
          </dd>
        </div>
      </dl>
      {stations.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not refresh hardware status.
        </p>
      )}
    </div>
  );
}
export function PrototypeStatus() {
  const { isMobile } = useSidebar();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          tooltip="Prototype status"
          aria-label="Prototype status"
        >
          <Cpu />
          <span className="group-data-[collapsible=icon]:hidden">Status</span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side={isMobile ? "top" : "right"}
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)]"
        aria-labelledby="prototype-status-title"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("prototype-status-title")?.focus();
        }}
      >
        <PrototypeDetails />
      </PopoverContent>
    </Popover>
  );
}
