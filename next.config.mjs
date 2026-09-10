/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A chave da Anthropic NUNCA pode vazar para o bundle client (critério de aceite 5).
  // Nada de NEXT_PUBLIC_ANTHROPIC_*; o teste em scripts/check-bundle-secrets.mjs falha o build se vazar.
};

export default nextConfig;
