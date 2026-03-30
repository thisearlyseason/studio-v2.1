"use client";

import React, { useMemo, useRef } from 'react';
import { TournamentGame } from '@/components/providers/team-provider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Download, Trophy, ChevronRight, Target, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportImageToPDF } from '@/lib/pdf-utils';

interface BracketProps {
  games: TournamentGame[];
  standalone?: boolean;
}

export default function TournamentBracket({ games, standalone = false }: BracketProps) {
  const bracketRef = useRef<HTMLDivElement>(null);

  const rounds = useMemo(() => {
    if (!games || games.length === 0) return [];
    
    const roundMap: Record<string, TournamentGame[]> = {};
    games.forEach(g => {
      const r = g.round || 'Pool Play';
      if (!roundMap[r]) roundMap[r] = [];
      roundMap[r].push(g);
    });

    // Order rounds logically if possible
    const roundOrder = [
      'Pool Play', 'Round 1', 'Round 2', 'Round 3', 'Round 4', 
      'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Championship', 'Finals',
      'WB Round 1', 'WB Semi-Final', 'LB Round 1', 'LB Semi-Final', 'IF NECESSARY'
    ];

    return Object.keys(roundMap)
      .sort((a, b) => {
        const idxA = roundOrder.indexOf(a);
        const idxB = roundOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      })
      .map(name => ({ name, games: roundMap[name] }));
  }, [games]);

  const handleDownload = async () => {
    if (!bracketRef.current) return;
    await exportImageToPDF(bracketRef.current, {
      title: "Tournament Bracket Archive",
      subtitle: "OFFICIAL BRACKET DATA • VERIFIED BY STUDIO SECURE HUB",
      filename: `tournament_bracket_export_${Date.now()}`
    });
  };

  if (rounds.length === 0) {
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
            <FileDown className="h-3 w-3 mr-2" /> Export Institutional PDF
          </Button>
        </div>
      )}

      <div 
        ref={bracketRef} 
        className={cn(
          "relative overflow-hidden p-12 lg:p-20 bg-[#0a0a0a] rounded-[3rem] shadow-2xl border border-white/5 min-h-[700px]",
          standalone && "rounded-none h-full min-h-screen"
        )}
      >
        <div className="absolute inset-0 bg-primary/5 opacity-30 pointer-events-none" />
        
        <div className="relative z-10 flex flex-nowrap items-center gap-16 lg:gap-24 overflow-x-auto pb-12">
          {rounds.map((round, rIdx) => (
            <div key={round.name} className="flex flex-col items-center gap-12 min-w-[280px]">
              <div className="space-y-2 text-center mb-4">
                <Badge className="bg-primary/20 text-primary border-none font-black text-[8px] h-5 px-3 uppercase tracking-[0.2em] shadow-lg">
                  Stage {rIdx + 1}
                </Badge>
                <h3 className="text-sm font-black uppercase tracking-widest text-white/40">{round.name}</h3>
              </div>

              <div className="flex flex-col gap-10 w-full">
                {round.games.map((game, gIdx) => (
                  <div key={game.id} className="relative group">
                    {/* Visual Connector Structure */}
                    {rIdx < rounds.length - 1 && (
                      <div className="absolute -right-12 lg:-right-16 top-1/2 -translate-y-1/2 w-12 lg:w-16 h-px bg-white/10 group-hover:bg-primary/40 transition-colors pointer-events-none">
                        <ChevronRight className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/10 group-hover:text-primary transition-colors" />
                      </div>
                    )}

                    <Card className={cn(
                      "rounded-[2rem] border-none shadow-2xl overflow-hidden bg-white/5 ring-1 ring-white/10 flex flex-col justify-center px-8 py-7 transition-all hover:ring-primary/40 hover:bg-white/[0.08] relative",
                      game.isCompleted && "ring-primary/20 bg-primary/[0.02]"
                    )}>
                      {/* Active Status Bar */}
                      <div className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 h-12 w-1.5 rounded-r-full transition-all",
                        game.isCompleted ? "bg-primary" : "bg-white/10 group-hover:bg-primary/60"
                      )} />
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center gap-4">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-tight truncate flex-1",
                            game.team1.toLowerCase() === 'tbd' ? "text-white/20" : "text-white/80"
                          )}>
                            {game.team1}
                          </span>
                          <span className={cn(
                            "text-sm font-black",
                            game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-white/40"
                          )}>
                            {game.score1}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-tight truncate flex-1",
                            game.team2.toLowerCase() === 'tbd' ? "text-white/20" : "text-white/80"
                          )}>
                            {game.team2}
                          </span>
                          <span className={cn(
                            "text-sm font-black",
                            game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-white/40"
                          )}>
                            {game.score2}
                          </span>
                        </div>
                      </div>

                      {/* Metadata Overlay (Visible on Hover) */}
                      <div className="absolute top-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[7px] font-black uppercase text-primary/60">{game.time}</p>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Championship Culmination Effect */}
          <div className="flex flex-col items-center justify-center min-w-[320px] px-8 py-20 bg-primary/[0.02] rounded-[4rem] border-2 border-dashed border-white/5 relative group ml-8">
            <div className="absolute inset-0 bg-primary/[0.01] opacity-0 group-hover:opacity-100 transition-opacity rounded-[4rem]" />
            <div className="relative w-full max-w-[220px] flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-[100px] animate-pulse scale-150" />
              <div className="relative z-10 w-48 h-48 group-hover:scale-110 transition-transform duration-700 ease-out">
                <img 
                  src="/artifacts/champion_trophy_render.png" 
                  alt="Championship Trophy" 
                  className="w-full h-full object-contain filter drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                />
              </div>
            </div>
            <div className="mt-12 text-center space-y-2 relative z-10">
              <p className="text-[9px] font-black uppercase tracking-[0.6em] text-primary/60 mb-1">Grand Finale Protocol</p>
              <h4 className="text-4xl font-black uppercase tracking-tighter text-white drop-shadow-2xl">Absolute Champion</h4>
              <div className="w-12 h-1 bg-primary mx-auto rounded-full mt-4 opacity-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
