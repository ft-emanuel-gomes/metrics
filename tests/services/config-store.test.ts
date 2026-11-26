import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  readConfig,
  writeConfig,
  updateConfig,
  setConfigBackend,
  ConfigConflictError,
  ConfigUnavailableError,
  type ConfigBackend,
} from "../../src/services/config-store";

/** Armazenamento em memória com o mesmo contrato de ETag do S3. */
function memoryBackend() {
  const files = new Map<string, { body: string; etag: string }>();
  let n = 0;
  let gets = 0;
  let failGets = false;
  const backend: ConfigBackend = {
    async get(key) {
      gets++;
      if (failGets) throw new Error("S3 fora do ar");
      return files.get(key) ?? null;
    },
    async put(key, body, cond) {
      const cur = files.get(key);
      if (cond.ifNoneMatch && cur) throw new ConfigConflictError(key);
      if (cond.ifMatch && cur?.etag !== cond.ifMatch) throw new ConfigConflictError(key);
      const etag = `"e${++n}"`;
      files.set(key, { body, etag });
      return { etag };
    },
  };
  return {
    backend,
    files,
    get gets() { return gets; },
    failGets(v: boolean) { failGets = v; },
    /** Simula outra pessoa gravando direto no armazenamento */
    externalWrite(key: string, data: unknown) { files.set(key, { body: JSON.stringify(data), etag: `"x${++n}"` }); },
  };
}

describe("config-store", () => {
  let mem: ReturnType<typeof memoryBackend>;
  beforeEach(() => {
    mem = memoryBackend();
    setConfigBackend(mem.backend);
  });
  afterAll(() => setConfigBackend(null));

  it("devolve null quando o arquivo não existe", async () => {
    expect((await readConfig("config/x.json")).data).toBeNull();
  });

  it("grava com auditoria e lê de volta", async () => {
    const saved = await writeConfig("config/x.json", { a: 1 }, { actor: "admin@mb.com" });
    expect(saved.updatedBy).toBe("admin@mb.com");
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const { data } = await readConfig<{ a: number }>("config/x.json", { fresh: true });
    expect(data?.a).toBe(1);
  });

  it("usa o cache dentro de 60s e ignora com fresh", async () => {
    await writeConfig("config/x.json", { a: 1 }, { actor: "a" });
    const before = mem.gets;
    await readConfig("config/x.json");
    expect(mem.gets).toBe(before); // veio do cache da própria gravação
    await readConfig("config/x.json", { fresh: true });
    expect(mem.gets).toBe(before + 1);
  });

  it("lança conflito quando o arquivo mudou desde a leitura", async () => {
    await writeConfig("config/x.json", { a: 1 }, { actor: "a" });
    const { etag } = await readConfig("config/x.json", { fresh: true });
    mem.externalWrite("config/x.json", { a: 2 });
    await expect(writeConfig("config/x.json", { a: 3 }, { actor: "a", ifMatch: etag })).rejects.toBeInstanceOf(ConfigConflictError);
  });

  it("updateConfig tenta de novo e aplica sobre o valor mais recente", async () => {
    await writeConfig("config/n.json", { n: 1 }, { actor: "a" });
    let calls = 0;
    const result = await updateConfig<{ n: number }>(
      "config/n.json",
      (cur) => {
        calls++;
        // Na primeira tentativa, outra pessoa grava no meio
        if (calls === 1) mem.externalWrite("config/n.json", { n: 10 });
        return { n: (cur?.n ?? 0) + 1 };
      },
      { actor: "a" }
    );
    expect(calls).toBe(2);
    expect((result as { n: number }).n).toBe(11);
  });

  it("updateConfig cria o arquivo quando ele não existe", async () => {
    const result = await updateConfig<{ n: number }>("config/novo.json", (cur) => ({ n: (cur?.n ?? 0) + 1 }), { actor: "a" });
    expect((result as { n: number }).n).toBe(1);
  });

  it("com o armazenamento fora do ar, usa o cache se houver e senão lança indisponível", async () => {
    await writeConfig("config/x.json", { a: 1 }, { actor: "a" });
    mem.failGets(true);
    expect((await readConfig<{ a: number }>("config/x.json", { fresh: true })).data?.a).toBe(1);
    await expect(readConfig("config/outro.json", { fresh: true })).rejects.toBeInstanceOf(ConfigUnavailableError);
  });
});
