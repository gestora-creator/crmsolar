import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async headers() {
    return [
      // 🔒 HTML DINÂMICO (autenticado) - Sempre valida no servidor
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
          {
            key: 'Vary',
            value: 'Authorization',
          },
        ],
      },

      // 📦 ASSETS ESTÁTICOS (JS/CSS com hash) - Cache 1 ano
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },

      import type { NextConfig } from "next"

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


      // 🔑 API ROUTES (dados dinâmicos)
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=60, s-maxage=300, stale-while-revalidate=3600',
            // private: browser cache only
            // max-age=60: browser cache 60s
            // s-maxage=300: edge cache 5min
            // stale-while-revalidate=3600: serve stale for 1h while revalidating
          },
          {
            key: 'Vary',
            value: 'Authorization, Accept-Encoding',
          },
        ],
      },

      // 🎬 TV Route (público)
      {
        source: '/tv/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, stale-while-revalidate=600',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
