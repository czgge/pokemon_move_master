import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { RetroButton } from "@/components/RetroButton";
import { RetroCard } from "@/components/RetroCard";
import { Database, Zap, AlertCircle, CheckCircle } from "lucide-react";

export default function Admin() {
  const [resetLoading, setResetLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [selectedGen, setSelectedGen] = useState(1);
  const [selectedGens, setSelectedGens] = useState<number[]>([1]); // Multi-select for generations
  const [puzzleFiles, setPuzzleFiles] = useState<Array<{
    filename: string;
    generation: number;
    size: number;
    puzzleCount: number;
    created: string;
    isComplete?: boolean;
  }>>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load puzzle files on mount
  useEffect(() => {
    loadPuzzleFiles();
  }, []);

  const toggleGenSelection = (gen: number) => {
    setSelectedGens(prev => 
      prev.includes(gen) 
        ? prev.filter(g => g !== gen)
        : [...prev, gen].sort((a, b) => a - b)
    );
  };

  const selectAllGens = () => {
    setSelectedGens([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  };

  const deselectAllGens = () => {
    setSelectedGens([]);
  };

  const loadPuzzleFiles = async () => {
    try {
      const res = await fetch("/api/admin/puzzle-files");
      const data = await res.json();
      if (data.files) {
        setPuzzleFiles(data.files);
      }
    } catch (error) {
      console.error("Error loading puzzle files:", error);
    }
  };

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

  const handleGeneratePuzzles = async () => {
    if (selectedGens.length === 0) {
      setMessage({ type: "error", text: "Seleziona almeno una generazione" });
      return;
    }

    setPuzzleLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/generate-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generations: selectedGens }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ 
          type: "success", 
          text: data.message
        });
        setTimeout(loadPuzzleFiles, 5000);
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella generazione puzzle" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handleGenerateAllPuzzles = async () => {
    setPuzzleLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/generate-all-puzzles", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setTimeout(loadPuzzleFiles, 5000);
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella generazione puzzle" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handleGenerateCompletePuzzles = async () => {
    if (selectedGens.length === 0) {
      setMessage({ type: "error", text: "Seleziona almeno una generazione" });
      return;
    }

    const totalHours = selectedGens.length * 2; // Estimate 2 hours per gen
    if (!confirm(`⚠️ La generazione COMPLETA può richiedere ~${totalHours} ore per ${selectedGens.length} generazioni. Continuare?`)) {
      return;
    }
    
    setPuzzleLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/generate-complete-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generations: selectedGens }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ 
          type: "success", 
          text: data.message
        });
        setTimeout(loadPuzzleFiles, 10000);
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella generazione completa" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handleGenerateAllCompletePuzzles = async () => {
    if (!confirm("⚠️ La generazione COMPLETA di TUTTE le generazioni può richiedere 10-20 ORE. Sei sicuro?")) {
      return;
    }
    
    setPuzzleLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/generate-complete-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setTimeout(loadPuzzleFiles, 10000);
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella generazione completa" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handleGenerateMewPuzzles = async () => {
    if (!confirm("⚠️ La generazione COMPLETA dei puzzle di Mew può richiedere 30-60 minuti. Continuare?")) {
      return;
    }
    
    setPuzzleLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/generate-mew-puzzles", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ 
          type: "success", 
          text: data.message
        });
        setTimeout(loadPuzzleFiles, 5000);
      } else {
        setMessage({ type: "error", text: data.message || "Errore nella generazione Mew" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handleStopGeneration = async () => {
    if (!confirm("Vuoi fermare la generazione in corso?")) {
      return;
    }
    
    setMessage(null);

    try {
      const res = await fetch("/api/admin/stop-generation", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
      } else {
        setMessage({ type: "error", text: data.message || "Errore nello stop" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Errore di connessione al server" });
    }
  };

  const handleDownloadPuzzle = (filename: string, gen: number) => {
    // Create a temporary link element to force download
    const link = document.createElement('a');
    
    // Check if it's the Mew file
    if (filename === 'puzzles-mew.csv') {
      link.href = `/api/admin/download-puzzle/mew`;
      link.download = 'puzzles-mew.csv';
    } else {
      link.href = `/api/admin/download-puzzle/${gen}`;
      link.download = `puzzles-gen${gen}.csv`;
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

        <RetroCard className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-blue-500" />
            <div>
              <h2 className="text-xl font-retro text-foreground">Genera Puzzle</h2>
              <p className="text-sm text-muted-foreground">Pre-calcola puzzle unici per velocizzare il gioco</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Genera un file CSV con puzzle unici per le generazioni selezionate.
            </p>
            <p className="font-bold text-foreground">
              💡 Modalità RAPIDA: ~3 puzzle per Pokemon (~5-20 minuti per gen)
            </p>
            <p className="font-bold text-blue-600">
              🚀 Modalità COMPLETA: TUTTI i puzzle possibili (~1-4 ore per gen)
            </p>
            <p className="text-xs">
              Controlla i log del server per il progresso.
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-mono text-muted-foreground">
                Seleziona Generazioni:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllGens}
                  className="text-xs font-mono text-blue-600 hover:underline"
                  disabled={puzzleLoading}
                >
                  Tutte
                </button>
                <button
                  onClick={deselectAllGens}
                  className="text-xs font-mono text-red-600 hover:underline"
                  disabled={puzzleLoading}
                >
                  Nessuna
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(gen => (
                <label
                  key={gen}
                  className={`flex items-center gap-2 p-2 pixel-border-sm cursor-pointer transition-colors ${
                    selectedGens.includes(gen)
                      ? 'bg-blue-100 border-blue-400'
                      : 'bg-muted/30 hover:bg-muted/50'
                  } ${puzzleLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGens.includes(gen)}
                    onChange={() => toggleGenSelection(gen)}
                    disabled={puzzleLoading}
                    className="w-4 h-4"
                  />
                  <span className="font-mono text-sm">Gen {gen}</span>
                </label>
              ))}
            </div>
            
            {selectedGens.length > 0 && (
              <p className="text-xs text-center text-muted-foreground font-mono">
                {selectedGens.length} generazione{selectedGens.length > 1 ? 'i' : ''} selezionata{selectedGens.length > 1 ? 'e' : ''}: Gen {selectedGens.join(', ')}
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <RetroButton
              onClick={handleGeneratePuzzles}
              isLoading={puzzleLoading}
              disabled={puzzleLoading || selectedGens.length === 0}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              Rapido
            </RetroButton>
            <RetroButton
              onClick={handleGenerateCompletePuzzles}
              isLoading={puzzleLoading}
              disabled={puzzleLoading || selectedGens.length === 0}
              variant="outline"
              className="w-full border-blue-300 text-blue-600"
            >
              <Zap className="w-4 h-4 mr-2" />
              Completo
            </RetroButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RetroButton
              onClick={handleGenerateAllPuzzles}
              isLoading={puzzleLoading}
              disabled={puzzleLoading}
              variant="outline"
              className="w-full"
            >
              Tutte Gen - Rapido
            </RetroButton>
            <RetroButton
              onClick={handleGenerateAllCompletePuzzles}
              isLoading={puzzleLoading}
              disabled={puzzleLoading}
              variant="outline"
              className="w-full border-blue-300 text-blue-600"
            >
              Tutte Gen - Completo
            </RetroButton>
          </div>
          <div className="border-t pt-3">
            <RetroButton
              onClick={handleGenerateMewPuzzles}
              isLoading={puzzleLoading}
              disabled={puzzleLoading}
              variant="outline"
              className="w-full border-purple-300 text-purple-600 hover:bg-purple-50"
            >
              🌟 Genera Mew Completo (~30-60min)
            </RetroButton>
          </div>
          <div className="border-t pt-3">
            <RetroButton
              onClick={handleStopGeneration}
              variant="outline"
              className="w-full border-red-300 text-red-600 hover:bg-red-50"
            >
              🛑 Ferma Generazione
            </RetroButton>
          </div>
          <div className="text-center text-xs text-muted-foreground font-mono">
            💡 Rapido: ~3 puzzle/Pokemon (5-20min) • Completo: TUTTI i puzzle (1-4h per gen) • Mew: TUTTI i puzzle (30-60min)
          </div>
        </RetroCard>

        <RetroCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-retro text-foreground">File Puzzle Disponibili</h3>
            <RetroButton
              onClick={loadPuzzleFiles}
              variant="outline"
              className="text-xs"
            >
              Ricarica
            </RetroButton>
          </div>
          
          {puzzleFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="font-mono text-sm">Nessun file puzzle trovato.</p>
              <p className="text-xs mt-2">Genera i puzzle usando i pulsanti sopra.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {puzzleFiles.map(file => (
                  <div key={file.filename} className="flex items-center justify-between p-3 pixel-border-sm bg-muted/30">
                    <div className="flex-1">
                      <p className="font-mono text-sm font-bold">
                        {(file as any).isMew ? (
                          <>
                            🌟 Mew
                            <span className="ml-2 text-xs text-purple-600">✨ COMPLETO</span>
                          </>
                        ) : (
                          <>
                            Gen {file.generation}
                            {file.isComplete && <span className="ml-2 text-xs text-blue-600">✨ COMPLETO</span>}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.puzzleCount.toLocaleString()} puzzle • {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <RetroButton
                      onClick={() => handleDownloadPuzzle(file.filename, file.generation)}
                      variant="outline"
                      className="text-xs"
                    >
                      Scarica
                    </RetroButton>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                💡 Scarica i file e caricali nella cartella <code className="bg-muted px-1">Pokemon-Move-Master/data/</code> del tuo repository
              </p>
            </>
          )}
        </RetroCard>

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
