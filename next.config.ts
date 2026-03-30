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
