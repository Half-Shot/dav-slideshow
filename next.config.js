/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  serverRuntimeConfig: {
    davUrl: process.env.DAV_URL,
    davUsername: process.env.DAV_USERNAME,
    davPassword: process.env.DAV_PASSWORD,
    davAlbum: process.env.DAV_ALBUM,
  }
}

module.exports = nextConfig
