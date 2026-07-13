/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow larger multipart bodies for server-side media uploads (local + self-host).
  // Vercel serverless still has platform payload limits — see README.
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  }
};

export default nextConfig;
