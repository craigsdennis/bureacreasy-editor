import { useState } from "react";
import { useNavigate } from "react-router";
import { useAgent } from "agents/react";
import type { Launcher, LauncherState } from "../../worker/agents/launcher-agent";

// Stamp SVG component for the approved effect
function ApprovedStamp({ className = "" }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 120 50" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="2" width="116" height="46" rx="4" stroke="currentColor" strokeWidth="3"/>
      <rect x="6" y="6" width="108" height="38" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
      <text x="60" y="32" textAnchor="middle" fill="currentColor" fontSize="16" fontFamily="Special Elite, monospace" fontWeight="bold">APPROVED</text>
    </svg>
  );
}

// File folder icon
function FolderIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

// Rubber stamp icon
function StampIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="16" width="16" height="4" rx="1" />
      <path d="M8 16V12a4 4 0 018 0v4" />
      <rect x="6" y="20" width="12" height="2" />
    </svg>
  );
}

// Document stack icon
function InboxIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z" />
      <path d="M3 15h6l2 2h2l2-2h6" />
    </svg>
  );
}

export function LauncherPage() {
  const [state, setState] = useState<LauncherState>({
    totalCount: 0,
    configs: {},
  });
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const navigate = useNavigate();

  const agent = useAgent<Launcher, LauncherState>({
    agent: "launcher",
    onStateUpdate(newState) {
      setState(newState);
    },
  });

  async function handleConfigurationSelection(configKey: string) {
    setIsCreating(configKey);
    try {
      const editorName = await agent.stub.createNewPreview({ configKey });
      navigate(`/previews/${editorName}`);
    } catch (error) {
      console.error("Failed to create preview:", error);
      setIsCreating(null);
    }
  }

  const configs = Object.entries(state.configs);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--paper-manila)' }}>
      {/* Background decorative elements */}
      <div className="absolute top-20 right-10 opacity-5 transform rotate-12 pointer-events-none">
        <ApprovedStamp className="w-64 h-32 text-[var(--stamp-green)]" />
      </div>
      <div className="absolute bottom-40 left-5 opacity-3 transform -rotate-6 pointer-events-none">
        <div className="w-32 h-32 rounded-full" style={{ 
          background: 'radial-gradient(ellipse at center, transparent 40%, var(--coffee-ring) 40%, var(--coffee-ring) 50%, transparent 50%)'
        }} />
      </div>
      
      {/* Red tape diagonal stripe */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ 
        background: 'repeating-linear-gradient(90deg, var(--stamp-red) 0px, var(--stamp-red) 20px, transparent 20px, transparent 30px)'
      }} />

      <div className="relative z-10 p-8 md:p-12">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <header className="mb-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded" style={{ background: 'var(--ink-navy)' }}>
                <StampIcon className="w-8 h-8 text-[var(--paper-cream)]" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ 
                  fontFamily: 'var(--font-typewriter)',
                  color: 'var(--ink-navy)',
                  textShadow: '2px 2px 0 var(--paper-shadow)'
                }}>
                  BUREAUCREASY
                </h1>
                <div className="text-sm tracking-widest uppercase mt-1" style={{ 
                  fontFamily: 'var(--font-typewriter)',
                  color: 'var(--ink-faded)'
                }}>
                  Official Document Processing Center
                </div>
              </div>
            </div>
            
            <p className="text-lg mt-6 max-w-xl" style={{ 
              fontFamily: 'var(--font-serif)',
              color: 'var(--ink-faded)',
              lineHeight: '1.8'
            }}>
              Select a site configuration from the filing cabinet below to 
              <span className="highlighted mx-1">begin your editing session</span>.
              All requests will be processed in order of receipt.
            </p>
          </header>

          {/* Stats Bar */}
          <div className="mb-8 p-4 flex items-center justify-between" style={{
            background: 'var(--paper-cream)',
            borderLeft: '4px solid var(--ink-navy)',
            boxShadow: '2px 2px 8px var(--shadow-soft)'
          }}>
            <div className="flex items-center gap-3">
              <InboxIcon className="w-5 h-5" style={{ color: 'var(--ink-faded)' }} />
              <span className="typewriter text-sm" style={{ color: 'var(--ink-faded)' }}>
                CASE FILE NO.
              </span>
              <span className="typewriter font-bold text-lg" style={{ color: 'var(--ink-navy)' }}>
                {String(state.totalCount).padStart(5, '0')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="status-dot status-dot-active" />
              <span className="text-xs uppercase tracking-wider" style={{ 
                fontFamily: 'var(--font-typewriter)',
                color: 'var(--stamp-green)'
              }}>
                System Online
              </span>
            </div>
          </div>

          {/* Configuration Cards - Filing Cabinet Style */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <FolderIcon className="w-5 h-5" style={{ color: 'var(--ink-faded)' }} />
              <h2 className="typewriter text-sm uppercase tracking-wider" style={{ color: 'var(--ink-faded)' }}>
                Available Configurations
              </h2>
            </div>

            {configs.length === 0 ? (
              <div className="document-card p-8 text-center animate-slide-in" style={{ opacity: 0 }}>
                <div className="typewriter" style={{ color: 'var(--ink-faded)' }}>
                  <span className="inline-block animate-pulse">RETRIEVING FILES FROM ARCHIVE...</span>
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full animate-pulse" style={{ 
                      background: 'var(--ink-faded)',
                      animationDelay: `${i * 0.2}s`
                    }} />
                  ))}
                </div>
              </div>
            ) : (
              configs.map(([key, config], index) => (
                <div
                  key={key}
                  className={`document-card hole-punch p-6 pl-12 animate-slide-in stagger-${index + 1}`}
                  style={{ opacity: 0 }}
                >
                  {/* Folder Tab */}
                  <div 
                    className="absolute -top-3 left-12 px-4 py-1 rounded-t text-xs uppercase tracking-wider"
                    style={{ 
                      background: index % 4 === 0 ? 'var(--folder-tab-blue)' : 
                                 index % 4 === 1 ? 'var(--folder-tab-green)' :
                                 index % 4 === 2 ? 'var(--folder-tab-yellow)' : 'var(--folder-tab-red)',
                      color: 'white',
                      fontFamily: 'var(--font-typewriter)',
                      boxShadow: '0 -2px 4px var(--shadow-soft)'
                    }}
                  >
                    Config #{String(index + 1).padStart(2, '0')}
                  </div>

                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-2" style={{ 
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--ink-navy)'
                      }}>
                        {config.displayName}
                      </h3>
                      
                      <div className="space-y-2 mt-4">
                        <div className="flex items-center gap-2">
                          <span className="typewriter text-xs uppercase" style={{ color: 'var(--ink-faded)' }}>
                            URL:
                          </span>
                          <a
                            href={config.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm truncate max-w-md"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {config.url}
                          </a>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="typewriter text-xs uppercase" style={{ color: 'var(--ink-faded)' }}>
                            Repository:
                          </span>
                          <code className="text-xs px-2 py-1">
                            {config.githubOwner}/{config.githubRepo}
                          </code>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      {/* Mini stamp decoration */}
                      <div 
                        className="text-xs px-3 py-1 transform -rotate-2"
                        style={{ 
                          color: 'var(--stamp-green)',
                          border: '2px solid var(--stamp-green)',
                          fontFamily: 'var(--font-typewriter)',
                          opacity: 0.7
                        }}
                      >
                        READY
                      </div>
                      
                      <button
                        onClick={() => handleConfigurationSelection(key)}
                        disabled={isCreating !== null}
                        className="btn-official flex items-center gap-2 group"
                      >
                        {isCreating === key ? (
                          <>
                            <span className="inline-block animate-spin">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2v4m0 12v4m-8-10h4m12 0h4m-5.66-5.66l-2.82 2.82m-5.04 5.04l-2.82 2.82m0-11.32l2.82 2.82m5.04 5.04l2.82 2.82" />
                              </svg>
                            </span>
                            Processing...
                          </>
                        ) : (
                          <>
                            <StampIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
                            Start Editing
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Decorative paper texture line */}
                  <div className="absolute bottom-0 left-0 right-0 h-px" style={{
                    background: 'linear-gradient(90deg, transparent, var(--border-light), transparent)'
                  }} />
                </div>
              ))
            )}
          </div>

          {/* Footer Notice */}
          <footer className="mt-16 pt-8" style={{ borderTop: '1px dashed var(--border-medium)' }}>
            <div className="flex items-center justify-between text-xs" style={{ 
              color: 'var(--ink-light)',
              fontFamily: 'var(--font-typewriter)'
            }}>
              <span>FORM BC-2024 REV. A</span>
              <span>OFFICIAL USE ONLY</span>
              <span>PAGE 1 OF 1</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
