const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.tsx', 'utf-8');

const newModalCode = `            <Dialog open={!!selectedBetaApp} onOpenChange={(open) => !open && setSelectedBetaApp(null)}>
              <DialogContent className="sm:max-w-6xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white dark:bg-[#0a0a0a] overflow-y-auto max-h-[90vh] custom-scrollbar">
                <DialogTitle className="sr-only">Review Application</DialogTitle>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="absolute top-6 right-6 z-50 h-10 w-10 rounded-full border-2 border-red-500 text-black dark:text-white hover:bg-red-50 hover:text-red-600 transition-all">
                    <X className="h-5 w-5" />
                  </Button>
                </DialogClose>
                {selectedBetaApp && (
                  <div className="flex flex-col lg:flex-row">
                    
                    {/* LEFT COLUMN */}
                    <div className="w-full lg:w-1/2 bg-gray-50/50 dark:bg-white/[0.02] p-8 md:p-12 space-y-10 lg:border-r border-gray-200 dark:border-white/10">
                      <DialogHeader className="mb-8">
                        <DialogTitle className="text-3xl md:text-4xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Application Review</DialogTitle>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mt-1">Reviewing {selectedBetaApp?.fullName || 'Applicant'}</p>
                      </DialogHeader>

                      {/* Section 1: Basic Info */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">1</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Basic Information</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Name</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.fullName}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Email</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white truncate">{selectedBetaApp.email}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Role</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.role}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Phone</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.phone || 'N/A'}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Org / Team</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.organization}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Feature Interest */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">4</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Feature Interest</h3>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1 mb-2 block">Selected modules to test</Label>
                          <div className="flex flex-wrap gap-3">
                            {(selectedBetaApp.features || []).length > 0 ? (selectedBetaApp.features || []).map((feat, i) => (
                              <div key={i} className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold">
                                {feat}
                              </div>
                            )) : <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-400">N/A</div>}
                          </div>
                        </div>
                      </div>

                      {/* Section 5: Community */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">5</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Community</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">How did you hear about us?</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.referral || 'N/A'}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">Social Media Handles</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.socials || 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Admin Action Box */}
                      {selectedBetaApp.status !== 'approved' && selectedBetaApp.status !== 'denied' && (
                        <div className="mt-8 p-8 bg-white dark:bg-[#0a0a0a] border-2 border-gray-200 dark:border-white/10 rounded-[2rem] shadow-xl space-y-6 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-1000">
                             <Shield className="h-48 w-48 text-primary" />
                          </div>
                          <div className="relative z-10 flex items-center gap-3">
                            <Shield className="w-6 h-6 text-primary" />
                            <h4 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Admin Action</h4>
                          </div>
                          
                          <div className="relative z-10 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-white/40 ml-1">Assign Access Password</Label>
                            <Input 
                              value={betaPassword} 
                              onChange={(e) => setBetaPassword(e.target.value)} 
                              placeholder="Type a password for the new user account" 
                              className="bg-gray-50 dark:bg-white/5 border-2 border-primary/40 h-14 rounded-xl font-mono text-base focus-visible:ring-primary shadow-inner"
                            />
                          </div>
                          <div className="relative z-10 flex flex-col gap-3 pt-2">
                            <Button 
                              className="w-full h-14 bg-[#4ade80] hover:bg-[#22c55e] text-black font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl shadow-xl shadow-emerald-500/20"
                              onClick={handleApproveBeta}
                              disabled={!betaPassword || processingBeta}
                            >
                              {processingBeta ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Approve Application & Create Account'}
                            </Button>
                            <Button 
                              variant="outline"
                              className="w-full h-14 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-black uppercase tracking-widest text-xs sm:text-sm rounded-xl transition-all"
                              onClick={handleDenyBeta}
                              disabled={processingBeta}
                            >
                              Deny Request
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedBetaApp.status === 'approved' && (
                        <div className="mt-8 bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-6 rounded-[2rem] text-center space-y-2">
                          <CheckCircle className="w-8 h-8 mx-auto" />
                          <h4 className="font-black uppercase text-lg tracking-widest">Application Approved</h4>
                          <p className="text-sm font-medium">This beta tester's account has been created successfully.</p>
                        </div>
                      )}
                      {selectedBetaApp.status === 'denied' && (
                        <div className="mt-8 bg-red-500/10 border-2 border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-[2rem] text-center space-y-2">
                          <XCircle className="w-8 h-8 mx-auto" />
                          <h4 className="font-black uppercase text-lg tracking-widest">Application Denied</h4>
                          <p className="text-sm font-medium">This beta application was rejected.</p>
                        </div>
                      )}

                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="w-full lg:w-1/2 p-8 md:p-12 space-y-10 bg-white dark:bg-[#0a0a0a]">
                      
                      {/* Section 2: Sports & Experience */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">2</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Sports & Experience</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Sports</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.sports}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Scale (Teams/Athletes)</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white">{selectedBetaApp.scale}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Current Tools</Label>
                            <div className="min-h-12 w-full flex items-center px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedBetaApp.currentTools}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Frustrations</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.frustrations}</div>
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Must Haves</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.mustHave || 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Quality Screening */}
                      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">3</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Quality Screening</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Why Beta?</Label>
                            <div className="min-h-[100px] w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-medium text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{selectedBetaApp.whyBeta}</div>
                          </div>
                          
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Tested Before?</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.tested_before || 'N/A'}</div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Expected Frequency</Label>
                            <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-900 dark:text-white capitalize">{selectedBetaApp.frequency || 'N/A'}</div>
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1 block mb-2">Devices</Label>
                            <div className="flex flex-wrap gap-3">
                              {(selectedBetaApp.devices || []).length > 0 ? (selectedBetaApp.devices || []).map((device, i) => (
                                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">{device}</span>
                                </div>
                              )) : <div className="h-12 w-full flex items-center px-4 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 font-bold text-sm text-gray-400">N/A</div>}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>`;

// Find the start and end of the Dialog component
const startTag = `<Dialog open={!!selectedBetaApp} onOpenChange={(open) => !open && setSelectedBetaApp(null)}>`;
const endTagPattern = /<\/DialogContent>\s*<\/Dialog>/;

const startIndex = code.indexOf(startTag);
const endMatch = code.substring(startIndex).match(endTagPattern);

if (startIndex !== -1 && endMatch) {
  const endIndex = startIndex + endMatch.index + endMatch[0].length;
  code = code.substring(0, startIndex) + newModalCode + code.substring(endIndex);
  fs.writeFileSync('src/app/admin/page.tsx', code);
  console.log("Successfully replaced modal code");
} else {
  console.error("Could not find the Dialog block to replace");
}
