/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'http',  hostname: 'localhost',            port: '8000' },
      { protocol: 'https', hostname: '**.supabase.co'                      },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com'           },
    ],
  },

  // Required: allow onnxruntime-web WASM to be served from /public/onnx/
  async headers() {
    return [
      {
        source: '/onnx/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',  value: 'require-corp' },
        ],
      },
    ];
  },

  webpack(config, { webpack }) {
    // Prevent Webpack from parsing Node-only modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^onnxruntime-node$/,
      })
    );
    // Allow .wasm file imports
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },

  async rewrites() {
    return [
      {
        source:      '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
