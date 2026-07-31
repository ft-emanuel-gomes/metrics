import NodeCache from "node-cache";

/**
 * Gerenciador de cache in-memory usando node-cache.
 * TTL individual por chave (definido no momento do set).
 * Singleton — uma instância para toda a aplicação.
 */
class CacheManager {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      checkperiod: 120, // Verificar expiração a cada 2 minutos
      useClones: false, // Performance: não clonar objetos
    });
  }

  /**
   * Busca valor do cache
   */
  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Salva valor no cache com TTL em segundos
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.cache.set(key, value, ttlSeconds);
  }

  /**
   * Remove uma chave específica do cache
   */
  del(key: string): void {
    this.cache.del(key);
  }

  /**
   * Remove todas as chaves que começam com um prefixo
   */
  delByPrefix(prefix: string): void {
    const keys = this.cache.keys().filter((k) => k.startsWith(prefix));
    keys.forEach((k) => this.cache.del(k));
  }

  /**
   * Limpa todo o cache (usado em invalidação manual)
   */
  flush(): void {
    this.cache.flushAll();
  }

  /**
   * Retorna estatísticas do cache
   */
  stats(): { keys: number; hits: number; misses: number } {
    const stats = this.cache.getStats();
    return {
      keys: this.cache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
    };
  }
}

// Singleton
let instance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}
