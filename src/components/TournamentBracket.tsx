import React, { useMemo, useRef } from 'react';
import { TournamentGame } from '@/components/providers/team-provider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Download, Trophy, Target, FileDown, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportImageToPDF } from '@/lib/pdf-utils';

interface BracketProps {
  games: TournamentGame[];
  standalone?: boolean;
  onGameClick?: (game: TournamentGame) => void;
  tournamentName?: string;
}

// Recursive Tree Node for Single/Double Elimination Brackets
function BracketNode({ game, allGames, onGameClick }: { game: TournamentGame, allGames: TournamentGame[], onGameClick?: (game: TournamentGame) => void }) {
  const feeder1 = allGames.find(g => g.winnerTo === game.id && g.winnerToSlot === 'team1');
  const feeder2 = allGames.find(g => g.winnerTo === game.id && g.winnerToSlot === 'team2');

  const hasFeeders = feeder1 || feeder2;
  const isCompleted = game.isCompleted;

  const EmptyFeeder = () => (
    <div className="w-52 h-[88px] bg-white/[0.02] border border-white/5 border-dashed rounded-lg flex flex-col items-center justify-center font-black uppercase text-[9px] tracking-widest relative z-20">
      <span className="text-white/30">AWAITING FEEDER</span>
    </div>
  );

  return (
    <div className="flex items-center relative animate-in fade-in zoom-in duration-500 my-4">
      {hasFeeders && (
        <div className="flex flex-col relative z-10 justify-around h-full gap-8 mr-8">
           {/* Top Feeder */}
           <div className="flex items-center justify-end relative">
              {feeder1 ? <BracketNode game={feeder1} allGames={allGames} onGameClick={onGameClick} /> : <EmptyFeeder />}
              {/* Connector to spine */}
              <div className="absolute -right-8 top-1/2 w-8 h-px bg-white/20 pointer-events-none" />
           </div>
           
           {/* Bottom Feeder */}
           <div className="flex items-center justify-end relative">
              {feeder2 ? <BracketNode game={feeder2} allGames={allGames} onGameClick={onGameClick} /> : <EmptyFeeder />}
              {/* Connector to spine */}
              <div className="absolute -right-8 top-1/2 w-8 h-px bg-white/20 pointer-events-none" />
           </div>

           {/* Vertical Spine */}
           <div className="absolute -right-8 top-[25%] bottom-[25%] w-px bg-white/20 pointer-events-none" />
           
           {/* Connector from spine to current match */}
           <div className="absolute -right-8 top-1/2 w-8 h-px bg-white/20 pointer-events-none" />
        </div>
      )}
      
      {/* Current Match Node */}
      <div className="relative group shrink-0">
         {/* Line connecting this node to its parent (if not the ultimate root AND NOT the first node returning to an empty div) */}
         {game.winnerTo && <div className="absolute top-1/2 -right-12 w-12 h-px bg-white/20 pointer-events-none" />}

         <div 
           onClick={() => { if(onGameClick) onGameClick(game); }}
           className={cn(
             "w-52 bg-[#0F172A] border rounded-lg overflow-hidden shadow-2xl relative z-20 transition-all cursor-pointer backdrop-blur-xl group-hover:block",
             isCompleted ? "border-primary/40 bg-[#0F172A]/90 hover:border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-white/10 hover:border-white/30"
           )}
         >
           {/* Header */}
           <div className="bg-black/40 px-3 py-1.5 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5">
             <span className="truncate pr-2">{game.round || 'MATCH'}</span>
             <span className="shrink-0">{game.time}</span>
           </div>
           
           {/* Body */}
           <div className="flex flex-col">
             {/* Team 1 */}
             <div className="flex justify-between items-center px-4 py-2 border-b border-white/5 bg-[#0F172A]/50 hover:bg-white/5 transition-colors">
               <div className="flex items-center gap-2 overflow-hidden">
                 {isCompleted && game.score1 > game.score2 && <Trophy className="h-3 w-3 text-yellow-500 shrink-0" />}
                 <span className={cn("text-xs font-bold uppercase truncate max-w-[124px]", (game.team1.includes('TBD') && !isCompleted) ? 'text-white/30' : 'text-white/90')}>{game.team1}</span>
               </div>
               <span className={cn("text-sm font-black", (game.score1 > game.score2 && isCompleted) ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "text-white/40")}>{game.score1}</span>
             </div>
             {/* Team 2 */}
             <div className="flex justify-between items-center px-4 py-2 bg-[#0F172A]/50 hover:bg-white/5 transition-colors relative">
               <div className="flex items-center gap-2 overflow-hidden">
                 {isCompleted && game.score2 > game.score1 && <Trophy className="h-3 w-3 text-yellow-500 shrink-0" />}
                 <span className={cn("text-xs font-bold uppercase truncate max-w-[124px]", (game.team2.includes('TBD') && !isCompleted) ? 'text-white/30' : 'text-white/90')}>{game.team2}</span>
               </div>
               <span className={cn("text-sm font-black", (game.score2 > game.score1 && isCompleted) ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "text-white/40")}>{game.score2}</span>
             </div>
           </div>

           {/* Completion Strip */}
           {isCompleted && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(var(--primary),1)]" />}
         </div>
      </div>
    </div>
  );
}

export default function TournamentBracket({ games, standalone = false, onGameClick, tournamentName }: BracketProps) {
  const bracketRef = useRef<HTMLDivElement>(null);

  // Separate Pool Play matches from true Elimination Bracket matches
  const { poolPlayGames, knockoutRoots } = useMemo(() => {
    const poolGames: TournamentGame[] = [];
    const roots: TournamentGame[] = []; // End-nodes of trees (Finals)

    games.forEach(g => {
      const isPool = g.round?.toLowerCase().includes('pool') || (!g.winnerTo && !g.round?.toLowerCase().includes('final') && !games.some(x => x.winnerTo === g.id));
      
      if (isPool) {
        poolGames.push(g);
      } else {
        // It's part of a bracket. Determine if it's a root (nothing points to it, or its winnerTo doesn't exist in games list)
        const isFeedingAnotherNode = games.some(parent => parent.id === g.winnerTo);
        if (!isFeedingAnotherNode) {
           roots.push(g);
        }
      }
    });

    return { poolPlayGames: poolGames, knockoutRoots: roots };
  }, [games]);

  const handleDownload = async () => {
    if (!bracketRef.current) return;
    await exportImageToPDF(bracketRef.current, {
      title: tournamentName || "Tournament Bracket Archive",
      subtitle: `SCHEDULED ARCHIVE • ${new Date().toLocaleDateString()}`,
      filename: `bracket_${tournamentName?.replace(/\s+/g, '_') || Date.now()}`,
      orientation: 'landscape',
      lightMode: true,
      compactHeader: true,
      hideFooter: true
    });
  };

  if (games.length === 0) {
    return (
      <div className="py-20 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
        <Trophy className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p className="text-sm font-black uppercase tracking-widest text-foreground">No matches scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!standalone && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="rounded-xl font-black text-[10px] uppercase border-black text-black hover:bg-black hover:text-white" onClick={handleDownload}>
            <FileDown className="h-3 w-3 mr-2" /> Export Visual Bracket
          </Button>
        </div>
      )}

      <div className="w-full overflow-x-auto pb-8 snap-x">
        <div 
          ref={bracketRef} 
          id="bracket-root-element"
          className={cn(
            "relative p-12 lg:p-20 bg-[#0a0a0a] rounded-[4rem] shadow-2xl border border-white/[0.05] min-h-[700px] min-w-max",
            standalone && "rounded-none h-full min-h-screen border-none"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-black to-black pointer-events-none rounded-[4rem]" />
        
        {/* Pool Play Grid (If any exist) */}
        {poolPlayGames.length > 0 && (
          <div className="relative z-10 mb-20 px-8">
            <div className="flex items-center gap-4 mb-10">
              <div className="bg-primary/20 p-3 rounded-full text-primary shadow-[0_0_20px_rgba(var(--primary),0.3)]"><Layers className="h-6 w-6" /></div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-white drop-shadow-lg">Pool Play Groups</h3>
                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Round Robin Format (No Elimination)</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 min-w-[800px]">
              {poolPlayGames.map(game => (
                <Card key={game.id} className="rounded-[2rem] border-none shadow-2xl bg-black/40 ring-2 ring-white/10 p-8 flex flex-col justify-center backdrop-blur-xl group hover:bg-white/10 hover:ring-primary/50 transition-all relative">
                  <div className="absolute top-0 right-0 px-6 py-4 flex gap-2">
                    <Badge className="bg-white/10 text-white hover:bg-white/20 border-none text-[8px] font-black uppercase tracking-widest">{game.location}</Badge>
                    <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-[8px] uppercase tracking-widest font-black">
                      {game.round || 'Pool Match'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4 pt-2">
                    <span className="text-white/40 text-[9px] uppercase tracking-widest font-black">
                      {new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <Badge className="bg-white text-black text-[9px] font-black uppercase tracking-widest shadow-lg">{game.time}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase text-lg text-white/90 truncate pr-4">{game.team1}</span>
                    <span className="font-black text-3xl text-white/40 group-hover:text-white drop-shadow-md transition-colors">{game.score1}</span>
                  </div>
                  <div className="py-4 flex items-center justify-center opacity-30"><Target className="h-5 w-5 text-white animate-pulse" /></div>
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase text-lg text-white/90 truncate pr-4">{game.team2}</span>
                    <span className="font-black text-3xl text-white/40 group-hover:text-white drop-shadow-md transition-colors">{game.score2}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Binary Elimination Tree rendering */}
        {knockoutRoots.length > 0 && (
          <div className="relative z-10 w-full pb-12 px-8 mt-12">
             <div className="flex items-center gap-4 mb-24 pdf-hide">
              <div className="bg-orange-500/20 p-3 rounded-full text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.3)]"><Trophy className="h-6 w-6" /></div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-white drop-shadow-lg">Elimination Bracket</h3>
                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Win and Advance Architecture</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-16 py-12 px-8 min-w-max">
              {knockoutRoots.map(rootGame => (
                <div key={rootGame.id} className="flex items-center relative group">
                   {/* Recursively compute the left-to-right tree starting from Finals at the far right! */}
                   <BracketNode game={rootGame} allGames={games} onGameClick={onGameClick} />
                   
                   {/* Ultimate Champion Display appended to the right of the Final Node */}
                   <div className="w-12 h-px bg-white/20 pointer-events-none ml-2" />
                   <div className="flex flex-col items-center justify-center p-8 ml-4">
                      <div className="w-40 h-40 relative group-hover:scale-110 transition-transform duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex items-center justify-center">
                        <div className="absolute inset-0 bg-yellow-500/40 rounded-full blur-[80px] animate-pulse" />
                        <Trophy className="relative z-10 w-full h-full text-yellow-500 filter drop-shadow-[0_10px_30px_rgba(234,179,8,0.8)]" />
                      </div>
                      <h2 className="text-3xl font-black uppercase tracking-tighter text-white drop-shadow-lg mt-6">Champion</h2>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
