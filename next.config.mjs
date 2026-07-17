/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow larger multipart bodies for server-side media uploads (local + self-host).
  // Vercel serverless still has platform payload limits — see README.
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  },
  /**
   * Konva/react-konva are browser-only. Without this, Next may try to resolve
   * the optional Node `canvas` peer during SSR/build and fail with
   * "Module not found: Can't resolve 'canvas'".
   */
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Prevent bundling the node-canvas optional dependency
      canvas: false
    };

    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        { canvas: 'commonjs canvas' },
        'canvas'
      ];
    }

    return config;
  }
};

export default nextConfig;
