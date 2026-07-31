import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "capacity.json");

interface CapacityData {
  [squad: string]: {
    [sprintId: string]: number;
  };
}

/**
 * Lê a capacidade (pessoas) salva para uma sprint específica de uma squad.
 * Retorna o valor salvo ou o fallback (teamSize da config).
 */
export function getSprintCapacity(
  squadSlug: string,
  sprintId: number,
  fallback: number
): number {
  try {
    if (!fs.existsSync(DATA_FILE)) return fallback;
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data: CapacityData = JSON.parse(raw);
    return data[squadSlug]?.[String(sprintId)] ?? fallback;
  } catch {
    return fallback;
  }
}
