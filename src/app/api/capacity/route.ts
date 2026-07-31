import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Armazena a capacidade (pessoas por sprint) para cada squad.
 * Formato: { "custodia": { "964": 6, "923": 5 }, ... }
 * Persistido em arquivo JSON (banco simples para v1).
 */

const DATA_FILE = path.join(process.cwd(), "data", "capacity.json");

interface CapacityData {
  [squad: string]: {
    [sprintId: string]: number; // pessoas
  };
}

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readCapacity(): CapacityData {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return {};
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeCapacity(data: CapacityData) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * GET /api/capacity?squad=custodia
 * Retorna capacidades salvas para a squad.
 */
export async function GET(request: NextRequest) {
  const squad = request.nextUrl.searchParams.get("squad");
  if (!squad) {
    return NextResponse.json({ error: "Parâmetro 'squad' obrigatório" }, { status: 400 });
  }

  const data = readCapacity();
  return NextResponse.json(data[squad] || {});
}

/**
 * POST /api/capacity
 * Body: { squad: "custodia", sprintId: "964", teamSize: 6 }
 * Salva a capacidade e retorna confirmação.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { squad, sprintId, teamSize } = body;

  if (!squad || !sprintId || !teamSize) {
    return NextResponse.json(
      { error: "Campos obrigatórios: squad, sprintId, teamSize" },
      { status: 400 }
    );
  }

  if (typeof teamSize !== "number" || teamSize < 1 || teamSize > 50) {
    return NextResponse.json(
      { error: "teamSize deve ser um número entre 1 e 50" },
      { status: 400 }
    );
  }

  const data = readCapacity();
  if (!data[squad]) data[squad] = {};
  data[squad][String(sprintId)] = teamSize;
  writeCapacity(data);

  return NextResponse.json({
    success: true,
    message: `Capacidade salva: ${teamSize} pessoas para sprint ${sprintId} da squad ${squad}`,
  });
}
