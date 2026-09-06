import { useState, useEffect, useRef } from 'react';
import { investigatorAPI, graphAPI } from '../api';

export default function AIInvestigatorAssistant({ caseId, caseInfo, preselectedPersonId = null }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello Investigator. I am your **NVIDIA Nemotron AI Assistant**.

I provide objective, evidence-grounded intelligence directly from case files, call detail records (CDRs), financial transactions, surveillance reports, and detected network patterns.

**How I can assist you:**
* **Summarize Case Findings:** High-level network architecture, top influential suspects, and active syndicates.
* **Explain Suspicion Indicators:** Deconstruct why specific individuals received high algorithmic suspicion or hierarchy scores.
* **Trace Relationship Paths:** Detail direct contacts, call frequencies, financial Hawala routes, and shared intermediaries.
* **Interpret Analytical Alerts:** Break down communication bursts, bridge nodes, cross-case linkages, and circular money laundering flows.

*Note: Algorithmic metrics serve as analytical indicators to guide field inquiry and do not constitute formal proof of guilt.*`,
      citations: [
        'Source: Operation Garuda Investigation Database',
        'Graph Engine: NetworkX Multi-Relational Store',
        'Model: NVIDIA Nemotron 3.5 Lightning',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState(preselectedPersonId || '');
  const [personsList, setPersonsList] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const chatEndRef = useRef(null);

  // Load persons list for the filter selector
  useEffect(() => {
    let isMounted = true;
    graphAPI.getPersons(caseId).then((res) => {
      if (isMounted && res.data) {
        setPersonsList(res.data);
      }
    }).catch((err) => {
      console.warn('Failed to load persons for assistant selector:', err);
    });

    // Load dynamic suggestion chips
    investigatorAPI.getSuggestions(caseId).then((res) => {
      if (isMounted && res.data?.suggestions) {
        setSuggestions(res.data.suggestions);
      }
    }).catch(() => {
      if (isMounted) {
        setSuggestions([
          'Summarize key case findings and structure',
          'What suspicious patterns and anomalies were detected?',
          'Analyze financial Hawala transfers and money flow',
        ]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (preselectedPersonId) {
      setSelectedPersonId(preselectedPersonId);
    }
  }, [preselectedPersonId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (queryText = inputQuery) => {
    const q = (queryText || '').trim();
    if (!q || loading) return;

    setError('');
    const userMsgId = `user-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: q,
      selectedPersonId: selectedPersonId || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await investigatorAPI.ask(caseId, q, selectedPersonId || null);
      const data = res.data;

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.answer || 'No response generated.',
        citations: data.evidence_used || [],
        model: data.model || 'nvidia/nemotron-3.5-lightning-30b-a3b',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('AI assistant error:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to communicate with AI Assistant.';
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Error:** ${errMsg}\n\nPlease check that the NVIDIA API key is configured or retry your inquiry.`,
          citations: [],
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format basic markdown (bold, lists, headers, code)
  const formatMarkdown = (content) => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements = [];
    let listItems = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} style={{ paddingLeft: '20px', margin: '8px 0' }}>
            {listItems.map((it, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: '1.5' }}>
                {renderInlineMarkdown(it)}
              </li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h4
            key={`h3-${lineIdx}`}
            style={{
              color: '#38BDF8',
              fontSize: '14px',
              fontWeight: 700,
              marginTop: '14px',
              marginBottom: '6px',
              letterSpacing: '0.2px',
            }}
          >
            {renderInlineMarkdown(trimmed.replace(/^###\s+/, ''))}
          </h4>
        );
        return;
      }

      // Heading 2
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h3
            key={`h2-${lineIdx}`}
            style={{
              color: '#60A5FA',
              fontSize: '15px',
              fontWeight: 800,
              marginTop: '16px',
              marginBottom: '8px',
            }}
          >
            {renderInlineMarkdown(trimmed.replace(/^##\s+/, ''))}
          </h3>
        );
        return;
      }

      // Bullet item (* or -)
      if (/^[\*\-]\s+/.test(trimmed)) {
        listItems.push(trimmed.replace(/^[\*\-]\s+/, ''));
        return;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(trimmed)) {
        listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
        return;
      }

      // Plain paragraph or divider
      flushList();
      if (trimmed === '---') {
        elements.push(<hr key={`hr-${lineIdx}`} style={{ borderColor: '#334155', margin: '12px 0' }} />);
      } else if (trimmed.length > 0) {
        elements.push(
          <p key={`p-${lineIdx}`} style={{ margin: '6px 0', lineHeight: '1.5' }}>
            {renderInlineMarkdown(line)}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  const renderInlineMarkdown = (text) => {
    // Replace bold **text** and code `text`
    const parts = [];
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={match.index} style={{ color: '#F1F5F9', fontWeight: 700 }}>
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            style={{
              background: '#0F172A',
              color: '#38BDF8',
              padding: '1px 5px',
              borderRadius: '3px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0B132B',
        color: '#E2E8F0',
        position: 'relative',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #1C2541 0%, #0B132B 100%)',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#FFF', letterSpacing: '-0.2px' }}>
                AI Investigator Assistant
              </h2>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#10B981',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10B981',
                    boxShadow: '0 0 8px #10B981',
                  }}
                />
                NVIDIA Nemotron Active
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>
              Case File: <strong style={{ color: '#CBD5E1' }}>{caseInfo?.title || 'Active Network'}</strong> — Grounded Evidentiary Reasoning
            </div>
          </div>
        </div>

        {/* Entity Focus Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
            Target Entity:
          </label>
          <select
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
            style={{
              background: '#1E293B',
              color: '#F1F5F9',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: '100%',
              minWidth: '170px',
            }}
          >
            <option value="">All Entities (Case-wide)</option>
            {personsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.suspicion_score ? `(Score: ${(p.suspicion_score).toFixed(2)})` : ''}
              </option>
            ))}
          </select>
          {selectedPersonId && (
            <button
              onClick={() => setSelectedPersonId('')}
              title="Clear entity focus"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Suggested Quick Intelligence Chips */}
      {suggestions.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            background: '#0F172A',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            ⚡ Quick Queries:
          </span>
          {suggestions.map((sug, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(sug)}
              disabled={loading}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#93C5FD',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '4px 12px',
                borderRadius: '14px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
                e.currentTarget.style.borderColor = '#60A5FA';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)';
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
              }}
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Chat Messages Timeline */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
              }}
            >
              <div
                style={{
                  maxWidth: isUser ? 'min(85%, 620px)' : 'min(98%, 880px)',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser
                    ? 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)'
                    : '#1E293B',
                  border: isUser ? '1px solid #3B82F6' : '1px solid #334155',
                  padding: '14px 16px',
                  boxShadow: isUser
                    ? '0 4px 12px rgba(29, 78, 216, 0.25)'
                    : '0 4px 14px rgba(0, 0, 0, 0.3)',
                  color: isUser ? '#FFFFFF' : '#CBD5E1',
                  fontSize: '13.5px',
                  position: 'relative',
                }}
              >
                {/* Message Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    fontSize: '11px',
                    color: isUser ? '#BFDBFE' : '#94A3B8',
                    borderBottom: isUser ? '1px solid rgba(255,255,255,0.15)' : '1px solid #334155',
                    paddingBottom: '6px',
                  }}
                >
                  <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isUser ? '👤 Investigator Inquiry' : '🤖 NVIDIA Nemotron Assistant'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Message Body */}
                <div style={{ color: isUser ? '#FFF' : '#E2E8F0' }}>
                  {formatMarkdown(msg.text)}
                </div>

                {/* Evidence Citations Box (For Assistant) */}
                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '10px 14px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#38BDF8',
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span>📋</span> Evidence Citations & Grounded Sources ({msg.citations.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {msg.citations.map((cite, cIdx) => (
                        <div
                          key={cIdx}
                          style={{
                            fontSize: '11px',
                            color: '#94A3B8',
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '6px',
                          }}
                        >
                          <span style={{ color: '#38BDF8', fontSize: '9px' }}>●</span>
                          <span>{cite}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Toolbar */}
                {!isUser && !msg.isError && (
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      fontSize: '11px',
                    }}
                  >
                    <button
                      onClick={() => copyToClipboard(msg.text, msg.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #475569',
                        color: '#94A3B8',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      {copiedId === msg.id ? '✓ Copied' : '📄 Copy Analysis'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
            <div
              style={{
                background: '#1E293B',
                border: '1px solid #334155',
                borderRadius: '14px 14px 14px 2px',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#38BDF8',
                fontSize: '13px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
              <span>NVIDIA Nemotron synthesizing case evidence and network patterns...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Form Bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#0F172A',
          borderTop: '1px solid #1E293B',
        }}
      >
        {error && (
          <div
            style={{
              padding: '6px 12px',
              marginBottom: '10px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#F87171',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              selectedPersonId
                ? `Ask anything regarding the selected person's evidence, records, or links...`
                : `Ask AI Investigator about suspects, Hawala flows, call bursts, or network relationships...`
            }
            style={{
              flex: 1,
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#FFFFFF',
              fontSize: '13.5px',
              outline: 'none',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={loading || !inputQuery.trim()}
            style={{
              background: loading || !inputQuery.trim()
                ? '#334155'
                : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 22px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: loading || !inputQuery.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: loading || !inputQuery.trim() ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Ask AI</span>
            <span>⚡</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>
            Press <kbd style={{ background: '#1E293B', padding: '1px 5px', borderRadius: '3px', border: '1px solid #334155' }}>Enter</kbd> to submit query
          </span>
          <span style={{ fontSize: '11px', color: '#64748B' }}>
            Evidentiary Guardrails Enforced • All queries logged for audit
          </span>
        </div>
      </div>
    </div>
  );
}
