import React, { useMemo, useRef } from 'react';
import { TournamentGame } from '@/components/providers/team-provider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Download, Trophy, Target, FileDown, Layers } from 'lucide-react';
import { SquadIdentity } from '@/components/SquadIdentity';
import { Button } from '@/components/ui/button';
import { exportImageToPDF } from '@/lib/pdf-utils';

interface BracketProps {
  games: TournamentGame[];
  standalone?: boolean;
  onGameClick?: (game: TournamentGame) => void;
  tournamentName?: string;
}

// Recursive Tree Node for Single/Double Elimination Brackets
const formatRoundName = (name?: string) => {
  if (!name) return 'MATCH';
  return name
    .replace(/Grand Final Reset/gi, 'Championship Decider')
    .replace(/Grand Final/gi, 'Championship')
    .replace(/WB Finals/gi, 'Winners Bracket Final')
    .replace(/LB Finals/gi, 'Losers Bracket Final')
    .replace(/WB Semi-Finals/gi, 'Winners Bracket Semi')
    .replace(/LB Semi-Finals/gi, 'Losers Bracket Semi')
    .toUpperCase();
};

function BracketNode({ game, allGames, onGameClick }: { game: TournamentGame, allGames: TournamentGame[], onGameClick?: (game: TournamentGame) => void }) {
  const feeder1 = allGames.find(g => g.winnerTo === game.id && g.winnerToSlot === 'team1');
  const feeder2 = allGames.find(g => g.winnerTo === game.id && g.winnerToSlot === 'team2');

  const hasFeeders = feeder1 || feeder2;
  const isCompleted = game.isCompleted;

  const EmptyFeeder = () => (
    <div className="w-40 h-[72px] bg-white/[0.02] border border-white/5 border-dashed rounded-lg flex flex-col items-center justify-center font-black uppercase text-[8px] tracking-widest relative z-20">
      <span className="text-white/30 truncate px-2">AWAITING FEEDER</span>
    </div>
  );

  return (
    <div className="flex items-center relative animate-in fade-in zoom-in duration-500 my-2">
      {hasFeeders && (
        <div className="flex flex-col relative z-10 justify-around h-full gap-4 mr-4">
           {/* Top Feeder */}
           <div className="flex items-center justify-end relative">
              {feeder1 ? <BracketNode game={feeder1} allGames={allGames} onGameClick={onGameClick} /> : <EmptyFeeder />}
              {/* Connector to spine */}
              <div className="absolute -right-4 top-1/2 w-4 h-px bg-white/20 pointer-events-none" />
           </div>
           
           {/* Bottom Feeder */}
           <div className="flex items-center justify-end relative">
              {feeder2 ? <BracketNode game={feeder2} allGames={allGames} onGameClick={onGameClick} /> : <EmptyFeeder />}
              {/* Connector to spine */}
              <div className="absolute -right-4 top-1/2 w-4 h-px bg-white/20 pointer-events-none" />
           </div>

           {/* Vertical Spine */}
           <div className="absolute -right-4 top-[25%] bottom-[25%] w-px bg-white/20 pointer-events-none" />
           
           {/* Connector from spine to current match */}
           <div className="absolute -right-4 top-1/2 w-4 h-px bg-white/20 pointer-events-none" />
        </div>
      )}
      
      {/* Current Match Node */}
      <div className="relative group shrink-0">
         {/* Line connecting this node to its parent */}
         {game.winnerTo && <div className="absolute top-1/2 -right-8 w-8 h-px bg-white/20 pointer-events-none" />}

         <div 
           onClick={() => { if(onGameClick) onGameClick(game); }}
           className={cn(
             "w-40 bg-[#0F172A] border rounded-lg overflow-hidden shadow-2xl relative z-20 transition-all cursor-pointer backdrop-blur-xl group-hover:block",
             isCompleted ? "border-primary/40 bg-[#0F172A]/90 hover:border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-white/10 hover:border-white/30"
           )}
         >
           {/* Header */}
           <div className="bg-black/40 px-2 py-1 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/50 border-b border-white/5">
             <span className="truncate pr-2">{formatRoundName(game.round)}</span>
             <span className="shrink-0">{game.time}</span>
           </div>
           
           {/* Body */}
           <div className="flex flex-col">
             {/* Team 1 */}
             <div className="flex justify-between items-center px-3 py-1.5 border-b border-white/5 bg-[#0F172A]/50 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <SquadIdentity 
                    teamId={game.team1Id} 
                    teamName={formatTeamName(game.team1)} 
                    logoUrl={game.team1LogoUrl}
                    logoClassName="h-4 w-4 rounded shadow-sm border shrink-0" 
                    showNameWithLogo
                    horizontal
                    textClassName={cn("text-[10px] font-bold uppercase truncate max-w-[110px]", (game.team1.includes('TBD') && !game.isCompleted) ? 'text-white/30' : 'text-white/90')}
                  />
                  {isCompleted && game.score1 > game.score2 && <Trophy className="h-2.5 w-2.5 text-yellow-500 shrink-0" />}
                </div>
                {!game.team1.includes('TBD') || game.isCompleted ? (
                  <span className={cn("text-xs font-black", (game.score1 > game.score2 && game.isCompleted) ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "text-white/40")}>
                    {game.score1}
                  </span>
                ) : <span className="text-[8px] font-black opacity-10">...</span>}
              </div>
             {/* Team 2 */}
             <div className="flex justify-between items-center px-3 py-1.5 bg-[#0F172A]/50 hover:bg-white/5 transition-colors relative">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <SquadIdentity 
                    teamId={game.team2Id} 
                    teamName={formatTeamName(game.team2)} 
                    logoUrl={game.team2LogoUrl}
                    logoClassName="h-4 w-4 rounded shadow-sm border shrink-0" 
                    showNameWithLogo
                    horizontal
                    textClassName={cn("text-[10px] font-bold uppercase truncate max-w-[110px]", (game.team2.includes('TBD') && !game.isCompleted) ? 'text-white/30' : 'text-white/90')}
                  />
                  {isCompleted && game.score2 > game.score1 && <Trophy className="h-2.5 w-2.5 text-yellow-500 shrink-0" />}
                </div>
                {!game.team2.includes('TBD') || game.isCompleted ? (
                  <span className={cn("text-xs font-black", (game.score2 > game.score1 && game.isCompleted) ? "text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" : "text-white/40")}>
                    {game.score2}
                  </span>
                ) : <span className="text-[8px] font-black opacity-10">...</span>}
              </div>
           </div>

           {/* Completion Strip */}
           {isCompleted && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_10px_rgba(var(--primary),1)]" />}
         </div>
      </div>
    </div>
  );
}

function formatTeamName(name?: string) {
  if (!name) return 'TBD';
  return name
    .replace(/\(GF Team 1\)/gi, '(Championship Team 1)')
    .replace(/\(GF Team 2\)/gi, '(Championship Team 2)')
    .replace(/\(WB Winner\)/gi, '(Winners Bracket)')
    .replace(/\(LB Winner\)/gi, '(Losers Bracket)')
    .replace(/Grand Final/gi, 'Championship');
}

export default function TournamentBracket({ games, standalone = false, onGameClick, tournamentName }: BracketProps) {
  const bracketRef = useRef<HTMLDivElement>(null);

  // Separate Pool Play matches from true Elimination Bracket matches
  const { poolPlayGames, knockoutRoots, activeGames } = useMemo(() => {
    const poolGames: TournamentGame[] = [];
    const roots: TournamentGame[] = []; 

    const resetMatch = games.find(g => g.isResetMatch || g.round === 'Championship Decider' || g.round === 'Grand Final Reset');
    let displayGames = games;

    if (resetMatch) {
       // Only show the reset/decider match if BOTH teams are definitively resolved (not TBD)
       const isNeeded = 
         resetMatch.team1 && !resetMatch.team1.toLowerCase().includes('tbd') && 
         resetMatch.team2 && !resetMatch.team2.toLowerCase().includes('tbd');
         
       if (!isNeeded) {
           displayGames = games.filter(g => g.id !== resetMatch.id);
       }
    }

    displayGames.forEach(g => {
      const isPool = g.round?.toLowerCase().includes('pool') || (!g.winnerTo && !g.round?.toLowerCase().includes('final') && !displayGames.some(x => x.winnerTo === g.id));
      
      if (isPool) {
        poolGames.push(g);
      } else {
        const isFeedingAnotherNode = displayGames.some(parent => parent.id === g.winnerTo);
        if (!isFeedingAnotherNode) {
           roots.push(g);
        }
      }
    });

    return { poolPlayGames: poolGames, knockoutRoots: roots, activeGames: displayGames };
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

        <div className="w-full overflow-x-auto pb-12 scrollbar-hide flex justify-start">
        <div 
          ref={bracketRef} 
          id="bracket-root-element"
          className={cn(
            "relative p-8 md:p-16 lg:p-24 bg-[#111] rounded-[3rem] shadow-2xl border border-white/[0.05] min-h-[600px] w-fit h-fit",
            standalone ? "rounded-none h-full min-h-screen border-none flex-1" : "mx-4 lg:mx-8"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-black to-black pointer-events-none rounded-[3rem]" />
        
        {/* Pool Play Grid (If any exist) */}
        {poolPlayGames.length > 0 && (
          <div className="relative z-10 mb-12 px-2 md:px-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/20 p-2.5 rounded-full text-primary shadow-[0_0_20px_rgba(var(--primary),0.3)]"><Layers className="h-4 w-4" /></div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-white drop-shadow-lg">Pool Play Groups</h3>
                <p className="text-[8px] uppercase tracking-[0.2em] font-black text-white/40">Round Robin Format</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {poolPlayGames.map(game => (
                <Card key={game.id} className="rounded-2xl border-none shadow-2xl bg-black/40 ring-1 ring-white/10 p-4 flex flex-col justify-center backdrop-blur-xl group hover:bg-white/10 hover:ring-primary/50 transition-all relative min-w-[200px]">
                  <div className="absolute top-0 right-0 px-3 py-2 flex gap-1.5">
                    <Badge className="bg-white/10 text-white hover:bg-white/20 border-none text-[6px] font-black uppercase tracking-widest">{game.location}</Badge>
                  </div>
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <span className="text-white/40 text-[8px] uppercase tracking-widest font-black">
                      {new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <Badge className="bg-white text-black text-[7px] font-black uppercase tracking-widest px-1.5">{game.time}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <SquadIdentity 
                        teamId={game.team1Id} 
                        teamName={game.team1} 
                        logoUrl={game.team1LogoUrl}
                        logoClassName="h-5 w-5 rounded shadow-sm border shrink-0" 
                        showNameWithLogo
                        horizontal
                        textClassName="font-bold uppercase text-xs text-white/90 truncate pr-2"
                      />
                    </div>
                    <span className="font-black text-xl text-white/40 group-hover:text-white drop-shadow-sm transition-colors">{game.score1}</span>
                  </div>
                  <div className="py-2 flex items-center justify-center opacity-20"><Target className="h-3 w-3 text-white animate-pulse" /></div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <SquadIdentity 
                        teamId={game.team2Id} 
                        teamName={game.team2} 
                        logoUrl={game.team2LogoUrl}
                        logoClassName="h-5 w-5 rounded shadow-sm border shrink-0" 
                        showNameWithLogo
                        horizontal
                        textClassName="font-bold uppercase text-xs text-white/90 truncate pr-2"
                      />
                    </div>
                    <span className="font-black text-xl text-white/40 group-hover:text-white drop-shadow-sm transition-colors">{game.score2}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Binary Elimination Tree rendering */}
        {knockoutRoots.length > 0 && (
          <div className="relative z-10 w-full pb-8 px-2 md:px-4 mt-6">
             <div className="flex items-center gap-3 mb-10 pdf-hide">
              <div className="bg-orange-500/20 p-2.5 rounded-full text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.3)]"><Trophy className="h-4 w-4" /></div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-white drop-shadow-lg">Elimination Bracket</h3>
                <p className="text-[8px] uppercase tracking-[0.2em] font-black text-white/40">Win and Advance</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-8 py-6 px-4 max-w-full overflow-visible">
              {knockoutRoots.map(rootGame => (
                <div key={rootGame.id} className="flex items-center relative group justify-start">
                   {/* Recursively compute the left-to-right tree starting from Finals at the far right! */}
                   <BracketNode game={rootGame} allGames={activeGames} onGameClick={onGameClick} />
                   
                   {/* Ultimate Champion Display appended to the right of the Final Node */}
                   <div className="w-8 h-px bg-white/20 pointer-events-none" />
                   <div className="flex flex-col items-center justify-center p-4">
                      <div className="w-20 h-20 relative group-hover:scale-110 transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex items-center justify-center">
                        <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-[40px] animate-pulse" />
                        <Trophy className="relative z-10 w-full h-full text-yellow-500 filter drop-shadow-[0_5px_15px_rgba(234,179,8,0.8)]" />
                      </div>
                      <h2 className="text-xl font-black uppercase tracking-tighter text-white drop-shadow-lg mt-3">Champion</h2>
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
