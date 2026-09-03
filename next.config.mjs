/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri sert des fichiers statiques : pas de serveur Node dans le bundle.
  output: "export",
  images: { unoptimized: true },
  // Evite les 404 sur les assets servis depuis le protocole tauri://
  trailingSlash: true,
};

export default nextConfig;
