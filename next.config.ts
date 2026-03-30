import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Desabilita a geração de Service Workers por qualquer plugin PWA
  // Esta é a forma mais eficaz de previnir problemas de cache com service workers.
  experimental: {
    serviceWorker: false,
  },

  // A configuração de headers foi movida para o middleware.ts para centralizar
  // a lógica de cache e autenticação.
}

export default nextConfig
