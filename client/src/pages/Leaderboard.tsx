import { useState } from "react";
import { Layout } from "@/components/Layout";
import { RetroCard } from "@/components/RetroCard";
import { RetroButton } from "@/components/RetroButton";
import { useLeaderboard, useSubmitScore } from "@/hooks/use-game";
import { Trophy, Medal, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default function Leaderboard() {
  const { data: scores, isLoading } = useLeaderboard();
  const [playerName, setPlayerName] = useState("");
  const submitScore = useSubmitScore();

  // Mock score for demo submission (normally passed from Game Over)
  const tempScore = 0; 

  const handleSubmit = () => {
    if (!playerName) return;
    submitScore.mutate({ playerName, score: Math.floor(Math.random() * 100) }); // Demo random score
    setPlayerName("");
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="font-retro text-2xl md:text-3xl flex items-center justify-center gap-3">
            <Trophy className="text-yellow-500 w-8 h-8" />
            Hall of Fame
          </h1>
          <p className="font-pixel text-xl text-muted-foreground">
            The very best, like no one ever was.
          </p>
        </div>

        {/* Temporary Input for Testing */}
        <RetroCard className="mb-8">
           <div className="flex gap-2">
             <Input 
               placeholder="Enter Trainer Name (Test Submission)" 
               value={playerName}
               onChange={(e) => setPlayerName(e.target.value)}
               className="font-pixel text-xl"
             />
             <RetroButton onClick={handleSubmit} disabled={!playerName || submitScore.isPending}>
               Join
             </RetroButton>
           </div>
        </RetroCard>

        <RetroCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b-4 border-foreground/10">
                <tr>
                  <th className="font-retro text-xs p-4 text-left w-20">Rank</th>
                  <th className="font-retro text-xs p-4 text-left">Trainer</th>
                  <th className="font-retro text-xs p-4 text-right">Score</th>
                  <th className="font-retro text-xs p-4 text-right hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center font-pixel text-xl">Loading records...</td>
                  </tr>
                ) : scores?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center font-pixel text-xl">No records yet. Be the first!</td>
                  </tr>
                ) : (
                  scores?.map((entry, i) => (
                    <tr key={entry.id} className="hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-retro text-sm">
                        {i === 0 && <Medal className="w-5 h-5 text-yellow-500" />}
                        {i === 1 && <Medal className="w-5 h-5 text-gray-400" />}
                        {i === 2 && <Medal className="w-5 h-5 text-amber-600" />}
                        {i > 2 && `#${i + 1}`}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-bold font-pixel text-xl uppercase">{entry.playerName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-retro text-primary">{entry.score}</td>
                      <td className="p-4 text-right font-pixel text-lg text-muted-foreground hidden sm:table-cell">
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
