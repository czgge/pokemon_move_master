import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { Database, Zap, AlertCircle, CheckCircle } from "lucide-react";

export default function Admin() {
  const [resetLoading, setResetLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleResetDatabase = async () => {
    if (!confirm("Sei sicuro di voler resettare il database? Questa operazione cancellerà tutti i dati!")) {
      return;
    }

    setResetLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/reset-database", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
      } else {
        setMessage({ type: "error", text: data.message || "Errore nel reset" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setResetLoading(false);
    }
  };

  const handleAddIndexes = async () => {
    setIndexLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/add-indexes", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella creazione degli indici" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setIndexLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-retro text-primary pixel-text-shadow">
            ADMIN PANEL
          </h1>
          <p className="text-muted-foreground">Gestione database e ottimizzazioni</p>
        </div>

        {message && (
          <div
            className={`p-4 rounded pixel-border-sm flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-100 text-green-800 border-green-300"
                : "bg-red-100 text-red-800 border-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="font-mono text-sm">{message.text}</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <RetroCard className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-500" />
              <div>
                <h2 className="text-xl font-retro text-foreground">Ottimizza Database</h2>
                <p className="text-sm text-muted-foreground">Crea indici per migliorare le performance</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Questa operazione crea indici sul database per velocizzare le query.
                Riduce il tempo di caricamento dei puzzle da 5-6 secondi a meno di 1 secondo.
              </p>
              <p className="font-bold text-foreground">
                ⚠️ Esegui questa operazione solo una volta dopo il reset del database.
              </p>
            </div>
            <RetroButton
              onClick={handleAddIndexes}
              isLoading={indexLoading}
              disabled={indexLoading}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              Crea Indici Database
            </RetroButton>
          </RetroCard>

          <RetroCard className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-red-500" />
              <div>
                <h2 className="text-xl font-retro text-foreground">Reset Database</h2>
                <p className="text-sm text-muted-foreground">Ricrea tutte le tabelle e ricarica i dati</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Questa operazione elimina tutti i dati esistenti e ricarica il database dai file CSV.
              </p>
              <p className="font-bold text-red-600">
                ⚠️ ATTENZIONE: Questa operazione è irreversibile!
              </p>
              <p className="text-xs">
                Dopo il reset, dovrai riavviare il server e poi creare gli indici.
              </p>
            </div>
            <RetroButton
              onClick={handleResetDatabase}
              isLoading={resetLoading}
              disabled={resetLoading}
              variant="outline"
              className="w-full border-red-300 text-red-600 hover:bg-red-50"
            >
              <Database className="w-4 h-4 mr-2" />
              Reset Database
            </RetroButton>
          </RetroCard>
        </div>

        <RetroCard className="p-6 space-y-3">
          <h3 className="text-lg font-retro text-foreground">Informazioni</h3>
          <div className="space-y-2 text-sm text-muted-foreground font-mono">
            <p>• Gli indici migliorano le performance delle query sul database</p>
            <p>• Vengono creati su pokemon_moves (pokemon_id, move_id, version_group_id)</p>
            <p>• Vengono creati su pokemon (species_name, generation_id)</p>
            <p>• L'operazione è sicura e può essere eseguita più volte (usa IF NOT EXISTS)</p>
            <p>• Dopo la creazione degli indici, il caricamento dei puzzle sarà molto più veloce</p>
          </div>
        </RetroCard>
      </div>
    </Layout>
  );
}
