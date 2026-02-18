import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";

export default function AdminReset() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!confirm("Sei sicuro di voler resettare il database? Questo cancellerà tutti i dati e li ricaricherà.")) {
      return;
    }

    setLoading(true);
    setStatus("Resetting database...");

    try {
      const response = await fetch('/api/admin/reset-database', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus("✅ Database reset completato! Ora riavvia il server (clicca Stop e poi Run in Replit)");
      } else {
        setStatus("❌ Errore: " + data.message);
      }
    } catch (error) {
      setStatus("❌ Errore di connessione: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <RetroCard className="p-8">
          <h1 className="text-3xl font-retro mb-6 text-center">ADMIN - RESET DATABASE</h1>
          
          <div className="space-y-4 mb-6">
            <p className="text-sm">
              Questo resetterà il database e creerà la tabella evolutions per supportare le catene evolutive.
            </p>
            <p className="text-sm font-bold text-red-600">
              ⚠️ Attenzione: Questo cancellerà tutti i dati esistenti!
            </p>
          </div>

          <RetroButton 
            onClick={handleReset} 
            disabled={loading}
            className="w-full mb-4"
          >
            {loading ? "Resetting..." : "Reset Database"}
          </RetroButton>

          {status && (
            <div className={`p-4 rounded border-2 ${
              status.includes("✅") ? "bg-green-50 border-green-500" : 
              status.includes("❌") ? "bg-red-50 border-red-500" : 
              "bg-blue-50 border-blue-500"
            }`}>
              <p className="text-sm font-mono whitespace-pre-wrap">{status}</p>
            </div>
          )}

          <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded">
            <p className="text-xs font-bold mb-2">Passi da seguire:</p>
            <ol className="text-xs space-y-1 list-decimal list-inside">
              <li>Clicca "Reset Database"</li>
              <li>Aspetta il messaggio di successo</li>
              <li>Vai su Replit e clicca Stop</li>
              <li>Clicca Run per riavviare il server</li>
              <li>Il database verrà automaticamente ri-popolato con i dati delle evoluzioni</li>
            </ol>
          </div>
        </RetroCard>
      </div>
    </Layout>
  );
}
