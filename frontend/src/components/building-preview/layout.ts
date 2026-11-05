export type Building = { id: string; name: string };
export type Floor = { id: string; building_id: string; name: string };
export type PlanRect = { x: number; y: number; width: number; depth: number };
export type Room = PlanRect & { name: string };
export const footprint: PlanRect = { x: 12, y: 15, width: 76, depth: 58 };
export const elevator: PlanRect = { x: 44, y: 55, width: 12, depth: 12 };
export const stairs: PlanRect = { x: 44, y: 18, width: 12, depth: 12 };
export const atrium: PlanRect = { x: 43, y: 35, width: 14, depth: 13 };
export const entrance = { x: 50, y: 73 };
const roomRects: PlanRect[] = [
  { x: 14, y: 17, width: 28, depth: 24 },
  { x: 58, y: 17, width: 28, depth: 24 },
  { x: 14, y: 51, width: 28, depth: 20 },
  { x: 58, y: 51, width: 28, depth: 20 },
];
const campusRooms = [
  ["Teaching wing", "Studio", "Study area", "Common room"],
  ["Library", "Classrooms", "Meeting rooms", "Student lounge"],
];
const mallRooms = [
  ["Retail wing", "Food court", "Main lobby", "Services"],
  ["Retail gallery", "Arcade", "Shopping area", "Cinema lobby"],
  ["Dining terrace", "Events hall", "Restaurants", "Lounge"],
];
export function floorRooms(buildingId: string, level: number): Room[] {
  const floors = buildingId === "mall" ? mallRooms : campusRooms;
  const names = floors[level % floors.length];
  return roomRects.map((rect, index) => ({ ...rect, name: names[index] }));
}
/** Backend plan coordinates are shared by SVG and the procedural 3D model. */
export function toWorld(x: number, y: number): [number, number] {
  return [(x - 50) * 0.2, (y - 44) * 0.2];
}
export function rectCenter(rect: PlanRect): [number, number] {
  return toWorld(rect.x + rect.width / 2, rect.y + rect.depth / 2);
}
