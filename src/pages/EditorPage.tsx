import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router";
import { useAgent } from "agents/react";
import type { EditorAgent, EditorState } from "../../worker/agents/editor-agent";

// Back arrow icon
function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
    </svg>
  );
}

// Document icon
function DocumentIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8m8 4H8m2-8H8" />
    </svg>
  );
}

// External link icon
function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3" />
    </svg>
  );
}

// Clock icon for processing status
function ClockIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

// Check icon for completed status
function CheckIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// Filing cabinet icon
function CabinetIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18" />
      <path d="M10 6h4M10 12h4M10 18h4" />
    </svg>
  );
}

// Send icon for prompt submission
function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export function EditorPage() {
  const { editorName } = useParams<{ editorName: string }>();
  const [state, setState] = useState<EditorState>({ isSetup: false, edits: [] });
  const [connected, setConnected] = useState(false);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [showSetupLog, setShowSetupLog] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiResponse, setAiResponse] = useState<string[]>([]);
  const setupStartedRef = useRef(false);
  const responseContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevEditsCountRef = useRef(0);

  // Agent connection - used for state sync via onStateUpdate callback
  const agent = useAgent<EditorAgent, EditorState>({
    agent: "editor-agent",
    name: editorName,
    onStateUpdate(newState) {
      setState(newState);
      setConnected(true);
    },
  });

  // Call setup() when connected and not yet set up
  useEffect(() => {
    async function runSetup() {
      if (!connected || state.isSetup || isSettingUp || setupStartedRef.current) {
        return;
      }
      
      setupStartedRef.current = true;
      setIsSettingUp(true);
      setShowSetupLog(true);
      setStatusMessages([]);
      
      try {
        // Call setup with streaming callbacks
        type StreamOptions = {
          onChunk?: (chunk: unknown) => void;
          onDone?: (finalChunk: unknown) => void;
          onError?: (error: string) => void;
        };
        
        await (agent as unknown as { 
          call: (m: string, a: unknown[], o: StreamOptions) => Promise<void> 
        }).call("setup", [], {
          onChunk: (chunk: unknown) => {
            if (typeof chunk === "string") {
              setStatusMessages(prev => [...prev, chunk]);
            }
          },
          onDone: () => {
            setStatusMessages(prev => [...prev, "Setup complete!"]);
            setIsSettingUp(false);
            // Keep the log visible for 3 seconds after completion
            setTimeout(() => {
              setShowSetupLog(false);
            }, 3000);
          },
          onError: (error: string) => {
            console.error("Setup error:", error);
            setStatusMessages(prev => [...prev, `Error: ${error}`]);
            setIsSettingUp(false);
          }
        });
      } catch (error) {
        console.error("Failed to setup editor:", error);
        setStatusMessages(prev => [...prev, `Error: ${error}`]);
        setIsSettingUp(false);
      }
    }
    
    runSetup();
  }, [connected, state.isSetup, isSettingUp, agent]);

  // When a new edit is stored in state, stop showing "Processing" and refresh the iframe
  useEffect(() => {
    const currentEditsCount = state.edits?.length || 0;
    
    if (currentEditsCount > prevEditsCountRef.current) {
      // A new edit was stored - stop showing processing
      setIsSubmitting(false);
      
      // Refresh the iframe to show the updated preview
      if (iframeRef.current && state.previewUrl) {
        iframeRef.current.src = state.previewUrl;
      }
    }
    
    prevEditsCountRef.current = currentEditsCount;
  }, [state.edits, state.previewUrl]);

  // Extract case number from editor name for display
  const caseNumber = editorName?.slice(-8).toUpperCase() || "00000000";
  
  // Show setup UI while setting up OR while the log is still visible after completion
  const showSetupUI = connected && (isSettingUp || showSetupLog);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--paper-manila)' }}>
      {/* Background watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div 
          className="text-[12rem] font-bold tracking-widest transform -rotate-12 select-none"
          style={{ 
            fontFamily: 'var(--font-typewriter)',
            color: 'var(--ink-navy)',
            opacity: 0.02
          }}
        >
          OFFICIAL
        </div>
      </div>

      {/* Red tape top border */}
      <div className="h-1" style={{ 
        background: 'repeating-linear-gradient(90deg, var(--stamp-red) 0px, var(--stamp-red) 20px, transparent 20px, transparent 30px)'
      }} />

      <div className="relative z-10 p-8 md:p-12">
        <div className="max-w-5xl mx-auto">
          {/* Navigation Header */}
          <nav className="mb-8 animate-slide-in" style={{ opacity: 0, animationDelay: '0s' }}>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm transition-all hover:gap-3"
              style={{ 
                fontFamily: 'var(--font-typewriter)',
                color: 'var(--ink-faded)',
                background: 'var(--paper-cream)',
                border: '1px solid var(--border-light)',
                textDecoration: 'none'
              }}
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Return to Filing Cabinet
            </Link>
          </nav>

          {/* Main Document Container */}
          <div 
            className="document-card hole-punch p-8 md:p-10 pl-14 animate-slide-in"
            style={{ opacity: 0, animationDelay: '0.1s' }}
          >
            {/* Document Header */}
            <header className="pb-6 mb-6" style={{ borderBottom: '2px solid var(--ink-navy)' }}>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="p-3 rounded"
                    style={{ background: 'var(--ink-navy)' }}
                  >
                    <DocumentIcon className="w-8 h-8 text-[var(--paper-cream)]" />
                  </div>
                  <div>
                    <h1 
                      className="text-3xl md:text-4xl font-bold tracking-tight"
                      style={{ 
                        fontFamily: 'var(--font-typewriter)',
                        color: 'var(--ink-navy)'
                      }}
                    >
                      EDITOR PREVIEW
                    </h1>
                    <div 
                      className="text-sm mt-1 tracking-wider uppercase"
                      style={{ 
                        fontFamily: 'var(--font-typewriter)',
                        color: 'var(--ink-faded)'
                      }}
                    >
                      Document Processing Form
                    </div>
                  </div>
                </div>

                {/* Status Stamp */}
                <div 
                  className={`stamp ${connected ? (state.isSetup ? 'stamp-approved animate-stamp' : 'stamp-pending') : 'stamp-pending'}`}
                  style={{ animationDelay: '0.5s' }}
                >
                  {!connected ? 'CONNECTING' : (state.isSetup ? 'ACTIVE' : 'PROCESSING')}
                </div>
              </div>
            </header>

            {/* Case Information */}
            <section className="mb-8 animate-slide-in" style={{ opacity: 0, animationDelay: '0.2s' }}>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Case Number Field */}
                <div>
                  <label 
                    className="block text-xs uppercase tracking-wider mb-2"
                    style={{ 
                      fontFamily: 'var(--font-typewriter)',
                      color: 'var(--ink-faded)'
                    }}
                  >
                    Case Reference No.
                  </label>
                  <div 
                    className="p-3 font-mono text-lg tracking-wider"
                    style={{ 
                      background: 'var(--paper-aged)',
                      border: '1px solid var(--border-light)',
                      color: 'var(--ink-navy)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    BC-{caseNumber}
                  </div>
                </div>

                {/* Full Reference */}
                <div>
                  <label 
                    className="block text-xs uppercase tracking-wider mb-2"
                    style={{ 
                      fontFamily: 'var(--font-typewriter)',
                      color: 'var(--ink-faded)'
                    }}
                  >
                    Full Reference ID
                  </label>
                  <div 
                    className="p-3 text-sm truncate"
                    style={{ 
                      background: 'var(--paper-aged)',
                      border: '1px solid var(--border-light)',
                      color: 'var(--ink-faded)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    {editorName}
                  </div>
                </div>
              </div>
            </section>

            {/* Main Content Area */}
            {!connected ? (
              <div 
                className="p-8 text-center animate-slide-in"
                style={{ 
                  background: 'var(--paper-aged)',
                  border: '1px dashed var(--border-medium)',
                  opacity: 0,
                  animationDelay: '0.3s'
                }}
              >
                <ClockIcon className="w-12 h-12 mx-auto mb-4 animate-pulse" style={{ color: 'var(--ink-faded)' }} />
                <div 
                  className="text-lg"
                  style={{ 
                    fontFamily: 'var(--font-typewriter)',
                    color: 'var(--ink-faded)'
                  }}
                >
                  ESTABLISHING SECURE CONNECTION...
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  {[1, 2, 3].map(i => (
                    <div 
                      key={i}
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ 
                        background: 'var(--ink-faded)',
                        animationDelay: `${i * 0.2}s`
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : showSetupUI ? (
              /* Setup Progress Section */
              <div className="space-y-6">
                <section 
                  className="animate-slide-in"
                  style={{ opacity: 0, animationDelay: '0.3s' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="status-dot status-dot-pending" />
                    <h2 
                      className="text-sm uppercase tracking-wider"
                      style={{ 
                        fontFamily: 'var(--font-typewriter)',
                        color: 'var(--ink-faded)'
                      }}
                    >
                      Setting Up Preview Environment
                    </h2>
                  </div>
                  
                  <div 
                    className="inbox-tray p-6"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <ClockIcon className="w-8 h-8 animate-pulse" style={{ color: 'var(--folder-tab-yellow)' }} />
                      <div>
                        <div 
                          className="text-sm"
                          style={{ 
                            fontFamily: 'var(--font-typewriter)',
                            color: 'var(--ink-navy)'
                          }}
                        >
                          INITIALIZING SANDBOX ENVIRONMENT
                        </div>
                        <div 
                          className="text-xs mt-1"
                          style={{ color: 'var(--ink-light)' }}
                        >
                          {state.displayName && `Preparing ${state.displayName}...`}
                        </div>
                      </div>
                    </div>

                    {/* Streaming Status Messages - Terminal-style output */}
                    {statusMessages.length > 0 && (
                      <div 
                        className="mt-4 pt-4"
                        style={{ borderTop: '1px dashed var(--border-medium)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <DocumentIcon className="w-4 h-4" style={{ color: 'var(--ink-faded)' }} />
                          <span 
                            className="text-xs uppercase tracking-wider"
                            style={{ 
                              fontFamily: 'var(--font-typewriter)',
                              color: 'var(--ink-faded)'
                            }}
                          >
                            Processing Log
                          </span>
                        </div>
                        <div 
                          className="p-3 max-h-48 overflow-y-auto"
                          style={{ 
                            background: 'var(--paper-aged)',
                            border: '1px solid var(--border-light)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            lineHeight: '1.8'
                          }}
                        >
                          {statusMessages.map((msg, i) => (
                            <div 
                              key={i}
                              className="flex items-start gap-2 animate-slide-in"
                              style={{ 
                                color: 'var(--ink-faded)',
                                opacity: 0,
                                animationDelay: `${i * 0.05}s`
                              }}
                            >
                              <span style={{ color: 'var(--stamp-green)' }}>&gt;</span>
                              <span>{msg}</span>
                            </div>
                          ))}
                          <div 
                            className="inline-block w-2 h-4 ml-4 animate-pulse"
                            style={{ background: 'var(--ink-faded)' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Preview URL Section */}
                <section 
                  className="animate-slide-in"
                  style={{ opacity: 0, animationDelay: '0.3s' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <CabinetIcon className="w-5 h-5" style={{ color: 'var(--ink-faded)' }} />
                    <h2 
                      className="text-sm uppercase tracking-wider"
                      style={{ 
                        fontFamily: 'var(--font-typewriter)',
                        color: 'var(--ink-faded)'
                      }}
                    >
                      Preview Access Point
                    </h2>
                  </div>
                  
                  <div 
                    className="inbox-tray p-6 relative"
                  >
                    {state.previewUrl ? (
                      <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <CheckIcon className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--stamp-green)' }} />
                            <div className="min-w-0 flex-1">
                              <div 
                                className="text-xs uppercase tracking-wider mb-1"
                                style={{ 
                                  fontFamily: 'var(--font-typewriter)',
                                  color: 'var(--stamp-green)'
                                }}
                              >
                                Preview Ready
                              </div>
                              <a
                                href={state.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-sm font-medium"
                                style={{ 
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--ink-navy)'
                                }}
                              >
                                {state.previewUrl}
                              </a>
                            </div>
                          </div>
                          
                          <a
                            href={state.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-stamp flex items-center gap-2 flex-shrink-0"
                            style={{ textDecoration: 'none' }}
                          >
                            <ExternalLinkIcon className="w-4 h-4" />
                            Open Preview
                          </a>
                        </div>

                        {/* Retro CRT Monitor Frame */}
                        <div className="retro-monitor">
                          {/* Monitor top bezel with vents */}
                          <div className="monitor-top-bezel">
                            <div className="monitor-vents">
                              {[...Array(12)].map((_, i) => (
                                <div key={i} className="vent-slot" />
                              ))}
                            </div>
                          </div>
                          
                          {/* Main monitor body */}
                          <div className="monitor-body">
                            {/* Left bezel with controls */}
                            <div className="monitor-side-bezel monitor-left-bezel">
                              <div className="monitor-badge">
                                <span className="badge-text">BC</span>
                              </div>
                              <div className="monitor-knob brightness-knob" title="Brightness">
                                <div className="knob-indicator" />
                              </div>
                              <div className="monitor-knob contrast-knob" title="Contrast">
                                <div className="knob-indicator" />
                              </div>
                            </div>
                            
                            {/* Screen area */}
                            <div className="monitor-screen-wrapper">
                              <div className="screen-inner-frame">
                                <iframe
                                  ref={iframeRef}
                                  src={state.previewUrl}
                                  title="Document Preview"
                                  className="preview-iframe"
                                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                />
                              </div>
                            </div>
                            
                            {/* Right bezel */}
                            <div className="monitor-side-bezel monitor-right-bezel">
                              <div className="power-led" />
                              <div className="model-label">
                                <span>MODEL</span>
                                <span>BC-2024</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Monitor bottom bezel */}
                          <div className="monitor-bottom-bezel">
                            <div className="brand-plate">
                              <span className="brand-name">BUREAUCREASY</span>
                              <span className="brand-model">DOCUMENT VIEWER MK.II</span>
                            </div>
                          </div>
                          
                          {/* Monitor stand */}
                          <div className="monitor-stand">
                            <div className="stand-neck" />
                            <div className="stand-base" />
                          </div>
                        </div>

                        {/* Prompt Input Section */}
                        <div 
                          className="mt-6 pt-6"
                          style={{ borderTop: '1px dashed var(--border-medium)' }}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <DocumentIcon className="w-5 h-5" style={{ color: 'var(--ink-faded)' }} />
                            <h3 
                              className="text-sm uppercase tracking-wider"
                              style={{ 
                                fontFamily: 'var(--font-typewriter)',
                                color: 'var(--ink-faded)'
                              }}
                            >
                              Change Request Form
                            </h3>
                          </div>
                          
                          <div 
                            className="p-4"
                            style={{ 
                              background: 'var(--paper-aged)',
                              border: '1px solid var(--border-light)'
                            }}
                          >
                            <label 
                              className="block text-xs uppercase tracking-wider mb-2"
                              style={{ 
                                fontFamily: 'var(--font-typewriter)',
                                color: 'var(--ink-faded)'
                              }}
                            >
                              Describe the changes you would like to make:
                            </label>
                            <textarea
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder="e.g., Change the header color to blue, add a footer with contact information..."
                              rows={4}
                              disabled={isSubmitting}
                              className="w-full p-3 resize-none"
                              style={{ 
                                fontFamily: 'var(--font-typewriter)',
                                fontSize: '0.875rem',
                                background: 'var(--paper-cream)',
                                border: '1px solid var(--border-medium)',
                                color: 'var(--ink-navy)',
                                outline: 'none'
                              }}
                              onFocus={(e) => {
                                e.target.style.borderColor = 'var(--ink-navy)';
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = 'var(--border-medium)';
                              }}
                            />
                            
                            <div className="flex justify-end mt-3">
                              <button
                                onClick={async () => {
                                  if (!prompt.trim() || isSubmitting) return;
                                  setIsSubmitting(true);
                                  setAiResponse([]);
                                  
                                  try {
                                    // Use streaming call pattern
                                    type StreamOptions = {
                                      onChunk?: (chunk: unknown) => void;
                                      onDone?: (finalChunk: unknown) => void;
                                      onError?: (error: string) => void;
                                    };
                                    
                                    await (agent as unknown as { 
                                      call: (m: string, a: unknown[], o: StreamOptions) => Promise<void> 
                                    }).call("submitPrompt", [{prompt}], {
                                      onChunk: (chunk: unknown) => {
                                        if (typeof chunk === "string") {
                                          setAiResponse(prev => [...prev, chunk]);
                                          // Auto-scroll to bottom
                                          if (responseContainerRef.current) {
                                            responseContainerRef.current.scrollTop = responseContainerRef.current.scrollHeight;
                                          }
                                        }
                                      },
                                      onDone: () => {
                                        // isSubmitting will be set to false when state.edits updates
                                        setPrompt("");
                                      },
                                      onError: (error: string) => {
                                        console.error("Submit error:", error);
                                        setAiResponse(prev => [...prev, `Error: ${error}`]);
                                        setIsSubmitting(false);
                                      }
                                    });
                                  } catch (error) {
                                    console.error("Failed to submit prompt:", error);
                                    setAiResponse(prev => [...prev, `Error: ${error}`]);
                                    setIsSubmitting(false);
                                  }
                                }}
                                disabled={!prompt.trim() || isSubmitting}
                                className="btn-official flex items-center gap-2"
                              >
                                <SendIcon className="w-4 h-4" />
                                {isSubmitting ? 'Processing...' : 'Submit Request'}
                              </button>
                            </div>

                            {/* AI Response Output */}
                            {(aiResponse.length > 0 || isSubmitting) && (
                              <div 
                                className="mt-4 pt-4"
                                style={{ borderTop: '1px dashed var(--border-medium)' }}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`status-dot ${isSubmitting ? 'status-dot-pending' : 'status-dot-active'}`} />
                                  <span 
                                    className="text-xs uppercase tracking-wider"
                                    style={{ 
                                      fontFamily: 'var(--font-typewriter)',
                                      color: 'var(--ink-faded)'
                                    }}
                                  >
                                    {isSubmitting ? 'Processing Request...' : 'Response'}
                                  </span>
                                </div>
                                <div 
                                  ref={responseContainerRef}
                                  className="p-3 max-h-64 overflow-y-auto"
                                  style={{ 
                                    background: 'var(--paper-cream)',
                                    border: '1px solid var(--border-light)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.75rem',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap',
                                    color: 'var(--ink-faded)'
                                  }}
                                >
                                  {aiResponse.join('')}
                                  {isSubmitting && (
                                    <span 
                                      className="inline-block w-2 h-4 ml-1 animate-pulse"
                                      style={{ background: 'var(--ink-faded)' }}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <ClockIcon className="w-8 h-8 animate-pulse" style={{ color: 'var(--folder-tab-yellow)' }} />
                        </div>
                        <div>
                          <div 
                            className="text-sm"
                            style={{ 
                              fontFamily: 'var(--font-typewriter)',
                              color: 'var(--ink-faded)'
                            }}
                          >
                            PREVIEW DEPLOYMENT IN PROGRESS
                          </div>
                          <div 
                            className="text-xs mt-1"
                            style={{ color: 'var(--ink-light)' }}
                          >
                            Please wait while your request is being processed...
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Raw State Debug Section */}
                <section 
                  className="animate-slide-in"
                  style={{ opacity: 0, animationDelay: '0.4s' }}
                >
                  <div 
                    className="pt-6"
                    style={{ borderTop: '1px dashed var(--border-medium)' }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <DocumentIcon className="w-5 h-5" style={{ color: 'var(--ink-faded)' }} />
                      <h3 
                        className="text-sm uppercase tracking-wider"
                        style={{ 
                          fontFamily: 'var(--font-typewriter)',
                          color: 'var(--ink-faded)'
                        }}
                      >
                        Internal Records (Debug)
                      </h3>
                    </div>
                    
                    <pre 
                      className="p-4 overflow-auto text-sm max-h-64"
                      style={{ 
                        background: 'var(--paper-aged)',
                        border: '1px solid var(--border-light)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-faded)'
                      }}
                    >
                      {JSON.stringify(state, null, 2)}
                    </pre>
                  </div>
                </section>
              </div>
            )}

            {/* Document Footer */}
            <footer 
              className="mt-10 pt-6 flex items-center justify-between animate-slide-in"
              style={{ 
                borderTop: '1px solid var(--border-light)',
                opacity: 0,
                animationDelay: '0.5s'
              }}
            >
              <div 
                className="text-xs"
                style={{ 
                  fontFamily: 'var(--font-typewriter)',
                  color: 'var(--ink-light)'
                }}
              >
                FORM ED-001 REV. B
              </div>
              
              <div className="flex items-center gap-4">
                <div 
                  className="text-xs"
                  style={{ 
                    fontFamily: 'var(--font-typewriter)',
                    color: 'var(--ink-light)'
                  }}
                >
                  {new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  }).toUpperCase()}
                </div>
                
                <div 
                  className="text-xs px-2 py-1"
                  style={{ 
                    fontFamily: 'var(--font-typewriter)',
                    color: 'var(--stamp-red)',
                    border: '1px solid var(--stamp-red)',
                    opacity: 0.6
                  }}
                >
                  CONFIDENTIAL
                </div>
              </div>
            </footer>
          </div>

          {/* Page Footer */}
          <div 
            className="mt-8 text-center animate-slide-in"
            style={{ opacity: 0, animationDelay: '0.6s' }}
          >
            <div 
              className="text-xs"
              style={{ 
                fontFamily: 'var(--font-typewriter)',
                color: 'var(--ink-light)'
              }}
            >
              BUREAUCREASY DOCUMENT PROCESSING CENTER
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
