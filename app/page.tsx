export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-2xl font-bold">RecorreAgora</h1>
      <p className="text-slate-600">
        Motor de extração no ar em <code className="text-sm">POST /api/extract</code>.
      </p>
      <p className="text-sm text-slate-500">
        As telas de captura e conferência entram no passo 4 do plano. Para testar a
        extração agora, use <code>npm run extract -- caminho/da/foto.jpg</code>.
      </p>
    </main>
  );
}
