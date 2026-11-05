import { binAttentionKind, matchesAttention } from "@/lib/bin-attention";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentRef, RefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Edges, OrbitControls, Outlines } from "@react-three/drei";
import { Vector3 } from "three";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
  elevator,
  entrance,
  floorRooms,
  footprint,
  stairs,
  rectCenter,
  toWorld,
  atrium,
} from "./layout";
import type { PreviewProps } from "./index";
import type { PlanRect } from "./layout";
import type { Station } from "@/api";
type Position = [number, number, number];
const darkQuery = "(prefers-color-scheme: dark)";
function subscribeDark(callback: () => void) {
  const query = matchMedia(darkQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const lightPalette = {
  background: "#f4f4f5",
  slab: "#e4e4e7",
  room: "#d4d4d8",
  wall: "#fafaf9",
  edge: "#a1a1aa",
  glass: "#9ab9bd",
  text: "#27272a",
  grid: "#dedee3",
};
const darkPalette = {
  background: "#18181b",
  slab: "#3f3f46",
  room: "#52525b",
  wall: "#71717a",
  edge: "#a1a1aa",
  glass: "#526f74",
  text: "#fafafa",
  grid: "#2b2b30",
};
type Palette = typeof lightPalette;
function Block({
  position,
  size,
  color,
  edge,
  opacity = 1,
}: {
  position: Position;
  size: Position;
  color: string;
  edge?: string;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.75}
        transparent={opacity < 1}
        opacity={opacity}
      />
      {edge && <Edges color={edge} />}
    </mesh>
  );
}
function PlanBlock({
  rect,
  y,
  height,
  color,
  edge,
}: {
  rect: PlanRect;
  y: number;
  height: number;
  color: string;
  edge?: string;
}) {
  const [x, z] = rectCenter(rect);
  return (
    <Block
      position={[x, y, z]}
      size={[rect.width * 0.2, height, rect.depth * 0.2]}
      color={color}
      edge={edge}
    />
  );
}
function FloorPlate({
  level,
  mall,
  y,
  palette,
}: {
  level: number;
  mall: boolean;
  y: number;
  palette: Palette;
}) {
  const slabs: PlanRect[] =
    mall && level > 0
      ? [
          { ...footprint, width: atrium.x - footprint.x },
          {
            x: atrium.x + atrium.width,
            y: footprint.y,
            width: footprint.x + footprint.width - atrium.x - atrium.width,
            depth: footprint.depth,
          },
          {
            x: atrium.x,
            y: footprint.y,
            width: atrium.width,
            depth: atrium.y - footprint.y,
          },
          {
            x: atrium.x,
            y: atrium.y + atrium.depth,
            width: atrium.width,
            depth: footprint.y + footprint.depth - atrium.y - atrium.depth,
          },
        ]
      : [footprint];
  return (
    <>
      {slabs.map((rect, index) => (
        <PlanBlock
          key={index}
          rect={rect}
          y={y}
          height={0.28}
          color={palette.slab}
          edge={palette.edge}
        />
      ))}
    </>
  );
}
function BinModel({
  bin,
  y,
  selected,
  hovered,
  setHover,
  onSelect,
  palette,
  dimmed,
}: {
  dimmed: boolean;
  bin: Station;
  y: number;
  selected: boolean;
  hovered: boolean;
  setHover: (id: string | null) => void;
  onSelect: (bin: Station) => void;
  palette: Palette;
}) {
  const [x, z] = toWorld(bin.x, bin.y);
  const active = selected || hovered;
  return (
    <group
      position={[x, y + 0.15, z]}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHover(bin.id);
      }}
      onPointerOut={() => setHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        if (event.delta < 6) onSelect(bin);
      }}
    >
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.95, 1.3, 0.8]} />
        <meshStandardMaterial
          color="#3f7869"
          roughness={0.55}
          transparent={dimmed}
          opacity={dimmed ? 0.22 : 1}
          depthWrite={!dimmed}
        />
        {active && (
          <Outlines
            thickness={0.055}
            color={selected ? "#77d4b0" : palette.text}
          />
        )}
      </mesh>
      <Block
        position={[0, 1.4, 0]}
        size={[1.05, 0.18, 0.92]}
        color="#315c51"
        opacity={dimmed ? 0.22 : 1}
      />
      <Block
        position={[0, 1.5, 0.08]}
        size={[0.55, 0.035, 0.25]}
        color="#142b25"
        opacity={dimmed ? 0.22 : 1}
      />
      <Block
        position={[0, 0.9, 0.413]}
        size={[0.34, 0.28, 0.025]}
        color="#e6eee9"
        opacity={dimmed ? 0.22 : 1}
      />
    </group>
  );
}
function BuildingModel({
  floors,
  building,
  stations,
  selectedId,
  onSelect,
  focusedFloorId,
  exploded,
  hovered,
  setHover,
  palette,
  attention,
}: PreviewProps & {
  exploded: boolean;
  hovered: string | null;
  setHover: (id: string | null) => void;
  palette: Palette;
}) {
  const shown = focusedFloorId
    ? floors.filter((floor) => floor.id === focusedFloorId)
    : floors;
  return (
    <group>
      {shown.map((floor, index) => {
        const level = floors.findIndex((item) => item.id === floor.id);
        const y = index * (exploded ? 5.2 : 3);
        const [liftX, liftZ] = rectCenter(elevator);
        const [stairX, stairZ] = rectCenter(stairs);
        return (
          <group key={floor.id}>
            <FloorPlate
              level={level}
              mall={building.id === "mall"}
              y={y}
              palette={palette}
            />
            {floorRooms(building.id, level).map((room) => (
              <PlanBlock
                key={room.name}
                rect={room}
                y={y + 0.16}
                height={0.045}
                color={palette.room}
              />
            ))}
            <Block
              position={[0, y + 0.9, -5.8]}
              size={[15.3, 1.55, 0.18]}
              color={palette.wall}
              edge={palette.edge}
            />
            <Block
              position={[-7.6, y + 0.9, 0]}
              size={[0.18, 1.55, 11.6]}
              color={palette.wall}
              edge={palette.edge}
            />
            {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((x) => (
              <Block
                key={x}
                position={[x, y + 1, -5.68]}
                size={[1.65, 0.75, 0.035]}
                color={palette.glass}
              />
            ))}
            {[
              [-7.4, -5.6],
              [7.4, -5.6],
              [-7.4, 5.6],
              [7.4, 5.6],
            ].map(([x, z], i) => (
              <Block
                key={i}
                position={[x, y + 1.2, z]}
                size={[0.25, 2.2, 0.25]}
                color={palette.wall}
              />
            ))}
            <Block
              position={[liftX, y + 1.05, liftZ]}
              size={[2.1, 1.8, 2.1]}
              color={palette.glass}
              edge={palette.edge}
            />
            <Block
              position={[liftX, y + 1.05, liftZ + 1.06]}
              size={[0.035, 1.5, 0.02]}
              color={palette.edge}
            />

            {[0, 1, 2, 3, 4, 5].map((step) => (
              <Block
                key={step}
                position={[
                  stairX,
                  y + 0.2 + step * 0.12,
                  stairZ - 0.9 + step * 0.36,
                ]}
                size={[1.9, 0.12 + step * 0.24, 0.36]}
                color={palette.wall}
              />
            ))}
            {level === 0 && (
              <group
                position={[
                  ...(() => {
                    const [x, z] = toWorld(entrance.x, entrance.y);
                    return [x, y, z] as Position;
                  })(),
                ]}
              >
                <Block
                  position={[-1.15, 1, 0]}
                  size={[0.16, 2, 0.22]}
                  color={palette.wall}
                />
                <Block
                  position={[1.15, 1, 0]}
                  size={[0.16, 2, 0.22]}
                  color={palette.wall}
                />
                <Block
                  position={[0, 2, 0]}
                  size={[2.5, 0.18, 0.28]}
                  color={palette.wall}
                />
                <Block
                  position={[0, 1, 0]}
                  size={[2.1, 1.8, 0.045]}
                  color={palette.glass}
                  opacity={0.55}
                />
              </group>
            )}

            {stations
              .filter((bin) => bin.floor_id === floor.id)
              .map((bin) => (
                <BinModel
                  key={bin.id}
                  bin={bin}
                  y={y}
                  selected={selectedId === bin.id}
                  hovered={hovered === bin.id}
                  setHover={setHover}
                  onSelect={onSelect}
                  palette={palette}
                  dimmed={!matchesAttention(bin, attention || "all")}
                />
              ))}
          </group>
        );
      })}
    </group>
  );
}
type ModelLabel = {
  id: string;
  position: Position;
  text: string;
  kind: "bin" | "floor" | "feature" | "room";
  bin?: Station;
};
function modelLabels(props: PreviewProps, exploded: boolean): ModelLabel[] {
  const shown = props.focusedFloorId
    ? props.floors.filter((floor) => floor.id === props.focusedFloorId)
    : props.floors;
  return shown.flatMap((floor, index) => {
    const y = index * (exploded ? 5.2 : 3);
    const level = props.floors.findIndex((item) => item.id === floor.id);
    const [liftX, liftZ] = rectCenter(elevator);
    const labels: ModelLabel[] = [
      {
        id: `floor-${floor.id}`,
        position: [-9, y + 0.3, 5.8],
        text: floor.name,
        kind: "floor",
      },
      {
        id: `lift-${floor.id}`,
        position: [liftX, y + 2.35, liftZ],
        text: "Elevator",
        kind: "feature",
      },
    ];
    if (level === 0) {
      const [x, z] = toWorld(entrance.x, entrance.y);
      labels.push({
        id: `entrance-${floor.id}`,
        position: [x, y + 0.2, z + 1.5],
        text: "Entrance",
        kind: "feature",
      });
    }
    if (shown.length === 1)
      for (const room of floorRooms(props.building.id, level)) {
        const [x, z] = rectCenter(room);
        labels.push({
          id: `room-${room.name}`,
          position: [x, y + 0.2, z - 1.1],
          text: room.name,
          kind: "room",
        });
      }
    for (const bin of props.stations.filter(
      (bin) => bin.floor_id === floor.id,
    )) {
      const [x, z] = toWorld(bin.x, bin.y);
      labels.push({
        id: `bin-${bin.id}`,
        position: [x, y + 2.1, z],
        text: bin.id.toUpperCase(),
        kind: "bin",
        bin,
      });
    }
    return labels;
  });
}
function ProjectLabels({
  labels,
  elements,
}: {
  labels: ModelLabel[];
  elements: RefObject<Map<string, HTMLDivElement>>;
}) {
  const vector = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const element = elements.current.get(label.id);
      if (!element) continue;
      vector.current.set(...label.position).project(camera);
      element.style.visibility =
        vector.current.z >= -1 && vector.current.z <= 1 ? "visible" : "hidden";
      element.style.transform = `translate3d(${(vector.current.x * 0.5 + 0.5) * size.width}px,${(-vector.current.y * 0.5 + 0.5) * size.height}px,0) translate(-50%,-50%)`;
    }
  });
  return null;
}
export type ThreeViewHandle = {
  reset: () => void;
  zoom: (factor: number) => void;
};
const SceneControls = forwardRef<ThreeViewHandle, { height: number }>(
  ({ height }, ref) => {
    const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
    const { camera, size, invalidate } = useThree();
    function reset() {
      const target = new Vector3(0, height / 2, 0);
      const radius =
        Math.sqrt(16 * 16 + 12 * 12 + (height + 3) * (height + 3)) / 2;
      const halfAngle = Math.atan(
        Math.tan((42 * Math.PI) / 360) *
          Math.min(size.width / Math.max(size.height, 1), 1),
      );
      const distance = (radius / Math.sin(halfAngle)) * 1.05;
      camera.position.copy(
        new Vector3(1.2, 1.05, 1.4)
          .normalize()
          .multiplyScalar(distance)
          .add(target),
      );
      camera.lookAt(target);
      if (controls.current) {
        controls.current.target.copy(target);
        controls.current.update();
      }
      invalidate();
    }
    useEffect(reset, [height, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
    useImperativeHandle(ref, () => ({
      reset,
      zoom(factor) {
        if (!controls.current) return;
        const target = controls.current.target;
        const offset = camera.position.clone().sub(target);
        offset.setLength(Math.min(95, Math.max(12, offset.length() * factor)));
        camera.position.copy(target).add(offset);
        controls.current.update();
        invalidate();
      },
    }));
    return (
      <OrbitControls
        ref={controls}
        makeDefault
        minDistance={12}
        maxDistance={95}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enablePan
        enableDamping
        dampingFactor={0.12}
      />
    );
  },
);
SceneControls.displayName = "SceneControls";
const Building3D = forwardRef<
  ThreeViewHandle,
  PreviewProps & { onFallback: () => void; exploded: boolean }
>((props, ref) => {
  const { exploded } = props;
  const [hovered, setHovered] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const labelElements = useRef(new Map<string, HTMLDivElement>());
  const controls = useRef<ThreeViewHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      reset: () => controls.current?.reset(),
      zoom: (factor) => controls.current?.zoom(factor),
    }),
    [],
  );
  const { theme } = useTheme();
  const systemDark = useSyncExternalStore(
    subscribeDark,
    () => matchMedia(darkQuery).matches,
    () => false,
  );
  const palette =
    theme === "dark" || (theme === "system" && systemDark)
      ? darkPalette
      : lightPalette;
  const shownCount = props.focusedFloorId ? 1 : props.floors.length;
  const labels = modelLabels(props, exploded);
  const height = (shownCount - 1) * (exploded ? 5.2 : 3) + 1.7;
  const fallback = (
    <div className="empty">
      <p>3D graphics are unavailable on this device.</p>
      <Button variant="outline" onClick={props.onFallback}>
        Use 2D floor plan
      </Button>
    </div>
  );
  return (
    <div className="three-view">
      <div
        className="model-canvas-area"
        style={{ cursor: hovered ? "pointer" : "grab" }}
        aria-label={`${props.building.name} interactive 3D building`}
      >
        {contextLost ? (
          fallback
        ) : (
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ fov: 42, near: 0.1, far: 200 }}
            gl={{ antialias: true, powerPreference: "low-power" }}
            fallback={fallback}
            onCreated={({ gl }) => {
              gl.domElement.dataset.renderer = "webgl";
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  setContextLost(true);
                },
                { once: true },
              );
            }}
          >
            <color attach="background" args={[palette.background]} />
            <ambientLight intensity={1.8} />
            <directionalLight position={[12, 25, 15]} intensity={2.4} />
            <directionalLight position={[-12, 15, -5]} intensity={0.8} />
            <gridHelper
              args={[34, 34, palette.grid, palette.grid]}
              position={[0, -0.25, 0]}
            />
            <BuildingModel
              {...props}
              onSelect={(bin) =>
                props.onSelect(
                  bin,
                  labelElements.current
                    .get(`bin-${bin.id}`)
                    ?.querySelector("button") || undefined,
                )
              }
              exploded={exploded}
              hovered={hovered}
              setHover={setHovered}
              palette={palette}
            />
            <ProjectLabels labels={labels} elements={labelElements} />
            <SceneControls ref={controls} height={height} />
          </Canvas>
        )}
        {!contextLost && (
          <div className="model-label-layer">
            {labels.map((label) => (
              <div
                key={label.id}
                className="model-label"
                style={{ visibility: "hidden" }}
                ref={(element) => {
                  if (element) labelElements.current.set(label.id, element);
                  else labelElements.current.delete(label.id);
                }}
              >
                {label.bin ? (
                  <button
                    type="button"
                    className="model-bin-label"
                    data-bin-id={label.bin.id}
                    data-dimmed={
                      !matchesAttention(label.bin, props.attention || "all")
                    }
                    data-attention={binAttentionKind(label.bin)}
                    data-highlighted={
                      hovered === label.bin.id ||
                      props.selectedId === label.bin.id
                    }
                    aria-label={`Select 3D bin ${label.bin.name}`}
                    aria-pressed={props.selectedId === label.bin.id}
                    onPointerEnter={() => setHovered(label.bin!.id)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(label.bin!.id)}
                    onBlur={() => setHovered(null)}
                    onClick={(event) =>
                      props.onSelect(label.bin!, event.currentTarget)
                    }
                  >
                    {label.text}
                  </button>
                ) : (
                  <span
                    className={
                      label.kind === "floor"
                        ? "model-floor-label"
                        : label.kind === "room"
                          ? "model-room-label"
                          : "model-feature-label"
                    }
                  >
                    {label.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
Building3D.displayName = "Building3D";
export default Building3D;
