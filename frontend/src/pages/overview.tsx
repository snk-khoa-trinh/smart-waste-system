import { useState } from "react";
import { BuildingPreview } from "@/components/building-preview";
import { useAPI } from "@/lib/dashboard";
import type { Station } from "@/api";
import type { Building, Floor } from "@/components/building-preview/layout";
export function OverviewPage() {
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const stations = useAPI<Station[]>("/stations");
  const buildings = useAPI<Building[]>("/buildings");
  const floors = useAPI<Floor[]>("/floors");
  const building =
    buildings.data?.find((item) => item.id === buildingId) ||
    buildings.data?.[0];
  const buildingFloors = (floors.data || []).filter(
    (floor) => floor.building_id === building?.id,
  );
  const buildingBins = (stations.data || []).filter((bin) =>
    buildingFloors.some((floor) => floor.id === bin.floor_id),
  );
  const failed = stations.isError || buildings.isError || floors.isError;
  return (
    <>
      <div className="page-heading">
        <h1>Collection overview</h1>
      </div>
      {failed && (
        <p role="alert" className="error mb-4">
          Could not refresh the overview.{" "}
          {stations.error?.message ||
            buildings.error?.message ||
            floors.error?.message}
        </p>
      )}
      {building ? (
        <BuildingPreview
          buildings={buildings.data || []}
          building={building}
          floors={buildingFloors}
          stations={buildingBins}
          selectedId={selectedId}
          activeFloorId={
            floorId === "all"
              ? buildingBins.find((bin) => bin.id === selectedId)?.floor_id
              : floorId
          }
          focusedFloorId={floorId === "all" ? undefined : floorId}
          dataAvailable={!failed && Boolean(stations.data && floors.data)}
          onSelect={(bin) => setSelectedId(bin.id)}
          onBuildingChange={(id) => {
            setBuildingId(id);
            setFloorId("all");
            setSelectedId("");
          }}
          onFloorChange={setFloorId}
        />
      ) : (
        <p className="empty">
          {buildings.isPending
            ? "Loading buildings…"
            : "No buildings configured."}
        </p>
      )}
    </>
  );
}
