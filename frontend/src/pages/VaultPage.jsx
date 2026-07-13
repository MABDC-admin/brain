import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ExternalLink, FolderOpen, FileText, File as LucideFile, FileImage, UploadCloud, X, Zap, Mic, Share } from 'lucide-react';
import { useHaptic } from '../hooks/useHaptic.js';
import SwipeableRow from '../components/SwipeableRow.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function parseVaultBody(file) {
  try {
    const parsed = JSON.parse(file.body || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default function VaultPage({ workspace }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetWorkspace, setTargetWorkspace] = useState(workspace || 'Company');
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, failed: [] });
  const fileInputRef = useRef(null);
  const haptic = useHaptic();

  const recognitionRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/items/type/vault_file?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(data => setFiles(data))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [workspace]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTargetWorkspace(workspace || 'Personal'); }, [workspace]);

  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    if (recording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      haptic.tap();
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        haptic.success();
        
        setUploading(true);
        const formData = new FormData();
        formData.append('transcript', transcript);
        formData.append('workspace', targetWorkspace);
        
        try {
          const res = await fetch(`${API}/api/vault_voice`, { method: 'POST', body: formData });
          if (res.ok) load();
        } catch {
          alert('Failed to save voice memo.');
        } finally {
          setUploading(false);
        }
      };
      recognition.onerror = () => { setRecording(false); haptic.error(); };
      recognition.onend = () => setRecording(false);
      
      recognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
    }
  };

  const handleUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;
    setUploading(true);
    setShowUploadModal(false);
    haptic.tap();
    setUploadProgress({ current: 0, total: selectedFiles.length, failed: [] });

    const failed = [];
    for (const [index, file] of selectedFiles.entries()) {
      setUploadProgress({ current: index + 1, total: selectedFiles.length, failed: [...failed] });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspace', targetWorkspace);

      try {
        const res = await fetch(`${API}/api/vault_upload`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
      } catch {
        failed.push(file.name);
        setUploadProgress({ current: index + 1, total: selectedFiles.length, failed: [...failed] });
      }
    }

    if (failed.length) {
      haptic.error();
      alert(`${failed.length} file${failed.length === 1 ? '' : 's'} failed: ${failed.join(', ')}`);
    } else {
      haptic.success();
    }

    try {
      load();
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, failed: [] });
      e.target.value = '';
    }
  };

  const deleteFile = async (id, phrase) => {
    haptic.delete();
    setFiles(p => p.filter(f => f.id !== id));
    try {
      const res = await fetch(`${API}/api/vault/${id}?phrase=${encodeURIComponent(phrase || '')}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      load();
      haptic.error();
      alert('Delete failed. Check the security phrase and try again.');
    }
  };

  const shareItem = (f, e) => {
    e.stopPropagation();
    haptic.tap();
    if (!f.image_url) {
      alert("This document does not have a shareable link yet.");
      return;
    }
    if (navigator.share) {
      navigator.share({
        title: f.title,
        text: `Check out this document: ${f.title}`,
        url: f.image_url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(f.image_url);
      alert("Link copied to clipboard!");
    }
  };

  const openPreview = (f) => {
    if (f.image_url) {
      setSelectedFile(f);
    } else {
      alert("Preview not available for this item.");
    }
  };

  const askVault = async () => {
    if (!ragQuery.trim()) return;
    setAsking(true);
    haptic.tap();
    
    try {
      const res = await fetch(`${API}/api/rag_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, workspace: workspace || 'Personal' })
      });
      const data = await res.json();
      setRagAnswer(data.answer);
      haptic.success();
    } catch {
      setRagAnswer("Sorry, I couldn't connect to the AI.");
      haptic.error();
    } finally {
      setAsking(false);
    }
  };

  const FileIcon = ({ name }) => {
    if (name.toLowerCase().endsWith('.pdf')) return <FileText className="w-6 h-6 text-red-400" />;
    if (name.toLowerCase().match(/\.(jpg|jpeg|png)$/)) return <FileImage className="w-6 h-6 text-blue-400" />;
    return <LucideFile className="w-6 h-6 text-gray-400" />;
  };

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      <div className="p-6 pb-4 shrink-0 bg-gradient-to-b from-[#14151b] to-transparent">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              The Vault
            </h1>
            <p className="text-gray-400 text-xs mt-1">Secure lifetime storage</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleMic} disabled={uploading}
              className={`p-3 rounded-full transition-colors ${recording ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400'}`}>
              <Mic className="w-6 h-6"/>
            </button>
            <button onClick={() => setShowUploadModal(true)} disabled={uploading}
              className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 p-3 rounded-full transition-colors">
              {uploading ? <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"/> : <UploadCloud className="w-6 h-6"/>}
            </button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} accept=".pdf,image/*,.doc,.docx" multiple />
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowUploadModal(false)}>
            <div className="bg-[#14151b] border border-[#2a2b36] rounded-3xl w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Upload Document</h3>
                <button onClick={() => setShowUploadModal(false)}><X className="w-5 h-5 text-gray-400"/></button>
              </div>
              <p className="text-sm text-gray-400 mb-4">Select the workspace for these documents. Vision scans run one file at a time for reliable extraction and reminders.</p>
              
              <div className="space-y-3 mb-6">
                {['Personal', 'Company', 'Employee Docs'].map(ws => (
                  <button key={ws} onClick={() => setTargetWorkspace(ws)}
                    className={`w-full py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-between border transition-all ${targetWorkspace === ws ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[#2a2b36] text-gray-400 hover:bg-[#1e1f28]'}`}>
                    {ws}
                    {targetWorkspace === ws && <Zap className="w-4 h-4"/>}
                  </button>
                ))}
              </div>
              
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold flex items-center justify-center gap-2">
                <UploadCloud className="w-5 h-5"/> Select Files
              </button>
            </div>
          </div>
        )}

        {/* Uploading Status Modal */}
        {uploading && (
          <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-[#14151b] border border-indigo-500/30 rounded-3xl w-full p-8 shadow-[0_0_40px_rgba(99,102,241,0.15)] flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#2a2b36]">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse w-full" />
              </div>
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                <Zap className="w-8 h-8 text-indigo-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Documents</h3>
              <p className="text-indigo-200 text-sm font-semibold mb-2">
                {uploadProgress.total > 1 ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}` : 'Uploading 1 of 1'}
              </p>
              <p className="text-gray-400 text-sm">Vault AI is reading one file at a time, auto-categorizing, and securing your documents...</p>
              {uploadProgress.failed.length > 0 && (
                <p className="text-red-300 text-xs mt-3">{uploadProgress.failed.length} failed so far</p>
              )}
            </div>
          </div>
        )}

        {/* RAG Search Bar */}
        <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 mb-4 shadow-lg">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
            <input
              type="text"
              value={ragQuery}
              onChange={e => setRagQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && askVault()}
              placeholder="Ask anything about your documents..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
            {asking ? (
              <div className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin"/>
            ) : (
              <button onClick={askVault} disabled={!ragQuery.trim()} className="text-indigo-400 font-semibold text-sm disabled:opacity-30">
                Ask
              </button>
            )}
          </div>
        </div>

        {ragAnswer && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 mb-4 relative">
            <button onClick={() => setRagAnswer(null)} className="absolute top-3 right-3 text-indigo-400/50 hover:text-indigo-400"><X className="w-4 h-4"/></button>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Vault AI</p>
            </div>
            <p className="text-sm text-indigo-100 leading-relaxed">{ragAnswer}</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-24">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"/></div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <FolderOpen className="w-16 h-16 text-gray-500 mb-4" />
            <p className="text-lg font-bold text-white mb-1">Your Vault is Empty</p>
            <p className="text-sm text-gray-400 max-w-[200px]">Upload PDFs, IDs, and contracts to securely store and query them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((f) => {
              const meta = parseVaultBody(f);
              const scanStatus = meta.scan_status || '';
              const scanAttempts = meta.scan_attempts || 0;
              const scanError = meta.scan_error || '';
              return (
              <SwipeableRow
                key={f.id}
                onDelete={() => deleteFile(f.id)}
                deleteTitle="Delete vault file?"
                deleteItemName={f.title}
                deleteMessage="This permanently removes the vault record and stored file. Type the security phrase to continue."
                deleteRequiredPhrase
              >
                <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 flex items-center gap-4 group cursor-pointer"
                  onClick={() => openPreview(f)}>
                  <div className="w-12 h-12 rounded-xl bg-[#0b0c10] border border-[#2a2b36] flex items-center justify-center shrink-0">
                    <FileIcon name={f.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate transition-colors text-white group-hover:text-indigo-400">
                        {f.title}
                      </h3>
                      {f.tags && (
                        <span className="bg-indigo-500/20 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {f.tags}
                        </span>
                      )}
                      {scanStatus === 'fallback' && (
                        <span className="bg-amber-500/15 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold" title={scanError || 'Vision scan used fallback text'}>
                          Fallback OCR
                        </span>
                      )}
                      {scanStatus === 'success' && (
                        <span className="bg-emerald-500/15 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold" title={`Vision attempts: ${scanAttempts}`}>
                          OCR OK
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{f.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => shareItem(f, e)}
                      className="p-2 bg-[#2a2b36] rounded-lg text-gray-400 hover:text-indigo-400 transition-colors">
                      <Share className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              </SwipeableRow>
              );
            })}
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="absolute inset-0 z-50 bg-[#0b0c10] flex flex-col page-enter">
          <div className="px-5 pt-6 pb-4 border-b border-[#1a1b23] shrink-0 flex items-center gap-3">
            <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-white p-1">
              <X className="w-6 h-6"/>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm truncate">{selectedFile.title}</p>
              <p className="text-gray-500 text-xs">{selectedFile.subtitle || 'Vault file'}</p>
            </div>
            <button onClick={() => window.open(selectedFile.image_url, '_blank', 'noopener,noreferrer')} className="p-2 bg-[#1a1b23] rounded-xl text-gray-400 hover:text-indigo-400 transition-colors" title="Open externally">
              <ExternalLink className="w-5 h-5"/>
            </button>
          </div>
          <div className="flex-1 bg-[#05060a]">
            {selectedFile.title?.toLowerCase().endsWith('.pdf') ? (
              <iframe
                title={selectedFile.title}
                src={selectedFile.image_url}
                className="w-full h-full border-0 bg-white"
              />
            ) : selectedFile.title?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                <img src={selectedFile.image_url} alt={selectedFile.title} className="max-w-full max-h-full object-contain rounded-xl"/>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <LucideFile className="w-14 h-14 text-gray-600 mb-4"/>
                <p className="text-white font-semibold mb-2">Preview unavailable</p>
                <p className="text-gray-500 text-sm mb-5">This file type can still be opened in a new browser tab.</p>
                <button onClick={() => window.open(selectedFile.image_url, '_blank', 'noopener,noreferrer')} className="px-4 py-3 rounded-xl bg-indigo-500 text-white font-semibold">
                  Open File
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
