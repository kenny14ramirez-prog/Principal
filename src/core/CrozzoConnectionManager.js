/**
 * Gestor avanzado de conexiones para Crozzo POS
 * Implementa Circuit Breaker + Backoff Exponencial + Timeout Adaptativo
 */

class ConnectionManager {
  constructor() {
    this.state = {
      failures: 0,
      lastSuccess: null,
      circuit: 'CLOSED', // OPEN/HALF/CLOSED
      latencyHistory: [],
      lastError: null
    };

    this.settings = {
      failureThreshold: 5,
      resetTimeout: 30000, // 30s
      maxRetries: 3,
      minTimeout: 5000, // 5s
      maxTimeout: 60000 // 60s
    };
  }

  getAdaptiveTimeout() {
    if (this.state.latencyHistory.length < 3) {
      return this.settings.minTimeout;
    }
    
    const avg = this.state.latencyHistory.reduce((a,b) => a+b, 0) / this.state.latencyHistory.length;
    const dev = Math.sqrt(
      this.state.latencyHistory
        .map(x => Math.pow(x - avg, 2))
        .reduce((a,b) => a+b) / this.state.latencyHistory.length
    );
    
    // Factor dinámico basado en fallos recientes
    const stressFactor = this.state.failures > 0 
      ? 1 + (Math.min(this.state.failures, 5) * 0.5)
      : 1;
    
    return Math.min(
      this.settings.maxTimeout,
      Math.max(
        this.settings.minTimeout, 
        avg + (dev * 2 * stressFactor)
      )
    );
  }

  async executeWithRetry(operation) {
    if (this.state.circuit === 'OPEN') {
      throw new Error(`Servicio no disponible (circuit ${this.state.circuit})`);
    }

    let attempt = 0;
    let lastError;
    
    while (attempt <= this.settings.maxRetries) {
      try {
        const timeout = this.getAdaptiveTimeout();
        const result = await Promise.race([
          operation(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
          )
        ]);
        
        // Actualizar estado
        this.state.failures = 0;
        this.state.lastSuccess = Date.now();
        this.state.circuit = 'CLOSED';
        this.state.latencyHistory.push(Date.now() - performance.now());
        if (this.state.latencyHistory.length > 10) {
          this.state.latencyHistory.shift();
        }
        
        return result;
      } catch (error) {
        lastError = error;
        this.state.failures++;
        this.state.lastError = error;
        
        if (this.state.failures >= this.settings.failureThreshold) {
          this.state.circuit = 'OPEN';
          setTimeout(() => {
            this.state.circuit = 'HALF';
          }, this.settings.resetTimeout);
        }
        
        if (attempt < this.settings.maxRetries) {
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = baseDelay * (0.1 + Math.random() * 0.4);
          await new Promise(resolve => setTimeout(resolve, jitter));
        }
        
        attempt++;
      }
    }
    
    throw lastError;
  }
}
