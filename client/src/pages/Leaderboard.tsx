import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { useLeaderboard } from "@/hooks/use-game";
import { Trophy, Calendar } from "lucide-react";
import { format } from "date-fns";
import { RetroButton } from "@/components/RetroButton";
import { useLocation } from "wouter";
import { useState } from "react";

export default function Leaderboard() {
  const [selectedGen, setSelectedGen] = useState<number>(1);
  const { data: scores, isLoading } = useLeaderboard(selectedGen);
  const [_, setLocation] = useLocation();

  const generations = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-retro text-foreground flex items-center gap-3">
            <Trophy className="w-6 h-6 md:w-8 md:h-8 text-yellow-500" />
            HALL OF FAME
          </h1>
          <RetroButton onClick={() => setLocation("/")} variant="outline" size="sm">
            Back Home
          </RetroButton>
        </div>

        {/* Generation Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 justify-center px-2">
          {generations.map((gen) => (
            <button
              key={gen}
              onClick={() => setSelectedGen(gen)}
              className={`px-3 md:px-4 py-2 rounded font-retro text-xs md:text-sm transition-all pixel-border-sm ${
                selectedGen === gen
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-foreground border-border hover:border-primary/50'
              }`}
            >
              GEN {gen}
            </button>
          ))}
        </div>

        <RetroCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider font-retro">
                <tr>
                  <th className="p-4 border-b border-border">Rank</th>
                  <th className="p-4 border-b border-border">Trainer</th>
                  <th className="p-4 border-b border-border">Score</th>
                  <th className="p-4 border-b border-border hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="p-4"><div className="h-4 w-8 bg-muted rounded" /></td>
                      <td className="p-4"><div className="h-4 w-32 bg-muted rounded" /></td>
                      <td className="p-4"><div className="h-4 w-16 bg-muted rounded" /></td>
                      <td className="p-4 hidden md:table-cell"><div className="h-4 w-24 bg-muted rounded" /></td>
                    </tr>
                  ))
                ) : scores?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No records yet. Be the first!
                    </td>
                  </tr>
                ) : (
                  scores?.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors font-mono text-sm md:text-lg">
                      <td className="p-4">
                        <span className={`inline-flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full font-bold text-xs md:text-base ${
                          index === 0 ? "bg-yellow-100 text-yellow-700" :
                          index === 1 ? "bg-gray-100 text-gray-700" :
                          index === 2 ? "bg-orange-100 text-orange-700" : ""
                        }`}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="p-2 md:p-4 font-bold uppercase text-primary text-xs md:text-base truncate max-w-[120px] md:max-w-none">{entry.playerName}</td>
                      <td className="p-2 md:p-4 font-retro text-sm md:text-base">{entry.score.toLocaleString()}</td>
                      <td className="p-4 hidden md:table-cell text-muted-foreground text-sm flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {entry.createdAt && format(new Date(entry.createdAt), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </RetroCard>
      </div>
    </Layout>
  );
}
