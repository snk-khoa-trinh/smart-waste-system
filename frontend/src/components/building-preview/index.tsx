import { useIsMobile } from "@/hooks/use-mobile";
import { Component, lazy, Suspense, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Box,
  Layers,
  Map,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { InfoTooltip } from "@/components/info-tooltip";
import { binAttention, matchesAttention } from "@/lib/bin-attention";
import type { AttentionFilter } from "@/lib/bin-attention";
import { FloorPlan } from "./floor-plan";
import { BinDetails } from "./bin-details";
import type { Building, Floor } from "./layout";
import type { Station } from "@/api";
import type { ThreeViewHandle } from "./three-view";
const Building3D = lazy(() => import("./three-view"));
class ModelBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty">
        <p>3D is unavailable on this device.</p>
        <Button variant="outline" onClick={this.props.onFallback}>
          Use 2D floor plan
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export type PreviewProps = {
  building: Building;
  floors: Floor[];
  stations: Station[];
  selectedId?: string;
  activeFloorId?: string;
  focusedFloorId?: string;
  attention?: AttentionFilter;
  onSelect: (bin: Station, anchor?: Element) => void;
  onFloorChange: (id: string) => void;
};
export function BuildingPreview(
  props: PreviewProps & {
    buildings: Building[];
    onBuildingChange: (id: string) => void;
    dataAvailable: boolean;
  },
) {
  const [mode, setMode] = useState("2d");
  const [attention, setAttention] = useState<AttentionFilter>("all");
  const [exploded, setExploded] = useState(true);
  const [open, setOpen] = useState(false);
  const three = useRef<ThreeViewHandle>(null);
  const anchorElement = useRef<Element | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  // Keep the virtual anchor identity stable; measure the latest marker on demand.
  const anchor = useRef({
    getBoundingClientRect: () =>
      (anchorElement.current?.isConnected
        ? anchorElement.current
        : surface.current
      )?.getBoundingClientRect() || new DOMRect(),
  });
  const floors = [...props.floors].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const activeFloor =
    floors.find((floor) => floor.id === props.activeFloorId) || floors[0];
  const focusedFloor =
    props.focusedFloorId &&
    floors.some((floor) => floor.id === props.focusedFloorId)
      ? props.focusedFloorId
      : undefined;
  const visibleFloor = mode === "2d" ? activeFloor?.id : focusedFloor;
  const scope = props.stations.filter(
    (bin) => !visibleFloor || bin.floor_id === visibleFloor,
  );
  const collectionCount = scope.filter(
    (bin) => binAttention(bin).collection.length > 0,
  ).length;
  const checkingCount = scope.filter(
    (bin) => binAttention(bin).needsChecking,
  ).length;
  const selected = scope.find((bin) => bin.id === props.selectedId);
  const matchingCount = scope.filter((bin) =>
    matchesAttention(bin, attention),
  ).length;
  function selectBin(bin: Station, element?: Element) {
    anchorElement.current = element || null;
    props.onSelect(bin, element);
    setOpen(true);
  }
  function changeFloor(id: string) {
    setOpen(false);
    props.onFloorChange(id);
  }
  function changeMode(value: string) {
    setOpen(false);
    setMode(value);
  }
  const sceneProps = {
    ...props,
    floors,
    attention,
    focusedFloorId: focusedFloor,
    onSelect: selectBin,
  };
  return (
    <section className="card building-preview" aria-label="Building preview">
      <div className="preview-heading">
        <Select
          value={props.building.id}
          onValueChange={(id) => {
            setOpen(false);
            setAttention("all");
            setExploded(true);
            props.onBuildingChange(id);
          }}
        >
          <SelectTrigger
            aria-label="Building"
            className="preview-building-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.buildings.map((building) => (
              <SelectItem value={building.id} key={building.id}>
                {building.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={mode} onValueChange={changeMode}>
          <TabsList aria-label="Preview mode">
            <TabsTrigger value="2d">
              <Map className="mr-1.5 size-3.5" />
              2D
            </TabsTrigger>
            <TabsTrigger value="3d">
              <Box className="mr-1.5 size-3.5" />
              3D
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="preview-controls">
        <Select
          value={mode === "2d" ? activeFloor?.id || "" : focusedFloor || "all"}
          onValueChange={changeFloor}
          disabled={!floors.length}
        >
          <SelectTrigger aria-label="Floor" className="w-28 sm:w-36">
            <SelectValue placeholder="Choose floor" />
          </SelectTrigger>
          <SelectContent>
            {mode === "3d" && <SelectItem value="all">All floors</SelectItem>}
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0 sm:gap-1">
          {mode === "3d" && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => three.current?.zoom(0.8)}
              >
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => three.current?.zoom(1.25)}
              >
                <Minus />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset 3D view"
                title="Reset view"
                onClick={() => three.current?.reset()}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={exploded ? "Floors separated" : "Floors stacked"}
                title={exploded ? "Stack floors" : "Separate floors"}
                aria-pressed={exploded}
                disabled={Boolean(focusedFloor) || floors.length < 2}
                onClick={() => setExploded(!exploded)}
              >
                <Layers />
              </Button>
            </>
          )}
          <InfoTooltip label="About building models" size="icon-sm">
            Schematic layouts using shared bin coordinates. Drag the 3D model to
            rotate; scroll or pinch to zoom. Select a bin for readings and its
            detail page. Entrances, elevators and stairs are marked on the
            model.
          </InfoTooltip>
        </div>
      </div>
      <div className="preview-surface" data-mode={mode} ref={surface}>
        <div
          className="preview-alert-overlay"
          role="group"
          aria-label="Bin alerts"
        >
          <Button
            variant="overlay"
            size="sm"
            aria-label={`Collection alerts: ${props.dataAvailable ? collectionCount : "unavailable"}`}
            aria-pressed={attention === "collection"}
            disabled={!props.dataAvailable}
            onClick={() =>
              setAttention(attention === "collection" ? "all" : "collection")
            }
          >
            <Trash2 />
            <span className="sm:hidden">Collect</span>
            <span className="hidden sm:inline">Collection alerts</span>
            <span className="tabular-nums">
              {props.dataAvailable ? collectionCount : "—"}
            </span>
          </Button>
          <Button
            variant="overlay"
            size="sm"
            aria-label={`Needs checking: ${props.dataAvailable ? checkingCount : "unavailable"}`}
            aria-pressed={attention === "checking"}
            disabled={!props.dataAvailable}
            onClick={() =>
              setAttention(attention === "checking" ? "all" : "checking")
            }
          >
            <Wrench />
            <span className="sm:hidden">Check</span>
            <span className="hidden sm:inline">Needs checking</span>
            <span className="tabular-nums">
              {props.dataAvailable ? checkingCount : "—"}
            </span>
          </Button>
          <InfoTooltip label="About collection alerts" size="icon-sm">
            Alerts exclude demo data and count each bin once. Sensor readings
            use prototype calibration. Alerts apply to the building and floors
            shown here. Collection alerts use current sensor readings at 80% or
            above. Needs checking includes missing, invalid or stale sensor
            readings and offline boards. Demo-only bins are excluded. Each bin
            is counted once per task; calibration is provisional. Press an
            active filter again to clear it; other bins remain dimmed for
            context.
          </InfoTooltip>
        </div>
        <span className="sr-only" role="status">
          {attention === "all"
            ? `${scope.length} bins in view`
            : `${matchingCount} matching bins in view`}
        </span>
        {activeFloor ? (
          mode === "2d" ? (
            <FloorPlan
              {...sceneProps}
              floor={activeFloor}
              level={floors.findIndex((floor) => floor.id === activeFloor.id)}
            />
          ) : (
            <ModelBoundary
              key={props.building.id}
              onFallback={() => changeMode("2d")}
            >
              <Suspense
                fallback={
                  <div className="model-loading" role="status">
                    Loading 3D model…
                  </div>
                }
              >
                <Building3D
                  {...sceneProps}
                  ref={three}
                  exploded={exploded}
                  onFallback={() => changeMode("2d")}
                />
              </Suspense>
            </ModelBoundary>
          )
        ) : (
          <p className="empty">No floors configured.</p>
        )}
        <Popover open={open && Boolean(selected)} onOpenChange={setOpen}>
          <PopoverAnchor virtualRef={anchor} />
          <PopoverContent
            aria-labelledby="selected-bin-title"
            side={isMobile ? "bottom" : "right"}
            align="center"
            collisionPadding={16}
            className="w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100svh-2rem)] overflow-y-auto"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const element = anchorElement.current;
              if (
                element?.isConnected &&
                (element instanceof HTMLElement ||
                  element instanceof SVGElement)
              )
                element.focus({ preventScroll: true });
            }}
          >
            {selected && (
              <BinDetails
                bin={selected}
                floorName={
                  floors.find((floor) => floor.id === selected.floor_id)?.name
                }
                available={props.dataAvailable}
                onClose={() => setOpen(false)}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
