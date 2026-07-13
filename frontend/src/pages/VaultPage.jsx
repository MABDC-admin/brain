import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CalendarClock, Check, CheckSquare, Download, ExternalLink, FolderOpen, FileText, File as LucideFile, FileImage, Mail, Pencil, RefreshCw, Square, Trash2, UploadCloud, UserRound, X, Zap, Mic, Share } from 'lucide-react';
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

function vaultMeta(file) {
  const body = parseVaultBody(file);
  const subtitleParts = (file.subtitle || '').split('•').map(part => part.trim()).filter(Boolean);
  return {
    body,
    category: body.category || subtitleParts[0] || 'Document',
    owner: body.owner || file.tags || subtitleParts[1] || '',
    expiry: body.expiry_date && body.expiry_date !== 'None' ? body.expiry_date : file.expiry_date || '',
    summary: body.summary || '',
    fullText: body.full_text || '',
    scanStatus: body.scan_status || '',
    scanAttempts: body.scan_attempts || 0,
    scanError: body.scan_error || '',
  };
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const expiry = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((expiry - start) / 86400000);
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
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewForm, setReviewForm] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [filterOwner, setFilterOwner] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState('');
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

  const enrichedFiles = files.map(file => ({ ...file, _meta: vaultMeta(file) }));
  const owners = ['All', ...Array.from(new Set(enrichedFiles.map(file => file._meta.owner).filter(Boolean))).sort()];
  const categories = ['All', ...Array.from(new Set(enrichedFiles.map(file => file._meta.category).filter(Boolean))).sort()];
  const expiringSoon = enrichedFiles.filter(file => {
    const days = daysUntil(file._meta.expiry);
    return days !== null && days <= 90;
  }).length;
  const reviewedCount = enrichedFiles.filter(file => file._meta.scanStatus === 'reviewed').length;
  const filteredFiles = enrichedFiles.filter(file => {
    const ownerOk = filterOwner === 'All' || file._meta.owner === filterOwner;
    const categoryOk = filterCategory === 'All' || file._meta.category === filterCategory;
    return ownerOk && categoryOk;
  });
  const selectedCount = selectedIds.length;
  const filteredIds = filteredFiles.map(file => file.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));

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

  const shareItem = async (f, e) => {
    e.stopPropagation();
    haptic.tap();
    if (!f.image_url) {
      alert("This document does not have a shareable link yet.");
      return;
    }
    let url = '';
    try {
      const response = await fetch(`${API}/items/${f.id}/share`, { method: 'POST' });
      if (!response.ok) throw new Error('Share failed');
      const data = await response.json();
      url = `${window.location.origin}/shared/${data.share_token}`;
    } catch {
      haptic.error();
      alert('Could not create a shared link.');
      return;
    }
    if (navigator.share) {
      navigator.share({
        title: f.title,
        text: `Check out this document: ${f.title}`,
        url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
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

  const toggleSelected = (id) => {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(current => allFilteredSelected ? current.filter(id => !filteredIds.includes(id)) : Array.from(new Set([...current, ...filteredIds])));
  };

  const beginReview = (file) => {
    const meta = vaultMeta(file);
    setReviewFile(file);
    setReviewForm({
      title: file.title || '',
      category: meta.category,
      owner: meta.owner,
      expiry_date: meta.expiry || 'None',
      summary: meta.summary,
      full_text: meta.fullText,
    });
  };

  const saveReview = async () => {
    if (!reviewFile || !reviewForm) return;
    setSavingReview(true);
    try {
      const res = await fetch(`${API}/api/vault/${reviewFile.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm),
      });
      if (!res.ok) throw new Error('Review save failed');
      const updated = await res.json();
      setFiles(current => current.map(file => file.id === updated.id ? updated : file));
      setSelectedFile(updated);
      setReviewFile(null);
      setReviewForm(null);
      haptic.success();
    } catch {
      haptic.error();
      alert('Could not save OCR review.');
    } finally {
      setSavingReview(false);
    }
  };

  const bulkOcr = async () => {
    if (!selectedCount) return;
    setBulkBusy('OCR');
    try {
      const response = await fetch(`${API}/api/vault/bulk/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) throw new Error('Bulk OCR failed');
      await load();
      haptic.success();
    } catch {
      haptic.error();
      alert('Bulk OCR failed.');
    } finally {
      setBulkBusy('');
    }
  };

  const bulkDelete = async () => {
    if (!selectedCount) return;
    const phrase = window.prompt(`Type the security phrase to delete ${selectedCount} selected document${selectedCount === 1 ? '' : 's'}.`);
    if (!phrase) return;
    setBulkBusy('Delete');
    try {
      const response = await fetch(`${API}/api/vault/bulk/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, phrase }),
      });
      if (!response.ok) throw new Error('Bulk delete failed');
      setFiles(current => current.filter(file => !selectedIds.includes(file.id)));
      setSelectedIds([]);
      haptic.success();
    } catch {
      haptic.error();
      alert('Bulk delete failed. Check the security phrase.');
    } finally {
      setBulkBusy('');
    }
  };

  const bulkEmail = async () => {
    if (!selectedCount) return;
    const to = window.prompt('Send selected vault documents to which email?');
    if (!to) return;
    setBulkBusy('Email');
    try {
      const response = await fetch(`${API}/api/vault/bulk/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, to }),
      });
      if (!response.ok) throw new Error('Bulk email failed');
      const result = await response.json();
      haptic.success();
      alert(`Sent ${result.sent_count || 0} of ${selectedCount} selected document${selectedCount === 1 ? '' : 's'}.`);
    } catch {
      haptic.error();
      alert('Bulk email failed.');
    } finally {
      setBulkBusy('');
    }
  };

  const bulkExport = async () => {
    if (!selectedCount) return;
    setBulkBusy('Export');
    try {
      const response = await fetch(`${API}/api/vault/bulk/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) throw new Error('Bulk export failed');
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data.documents || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vault-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      haptic.success();
    } catch {
      haptic.error();
      alert('Bulk export failed.');
    } finally {
      setBulkBusy('');
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

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-2xl bg-[#14151b] border border-[#2a2b36] p-3">
            <p className="text-lg font-black text-white">{files.length}</p>
            <p className="text-[10px] font-bold uppercase text-gray-500">Docs</p>
          </div>
          <div className="rounded-2xl bg-[#14151b] border border-[#2a2b36] p-3">
            <p className="text-lg font-black text-amber-300">{expiringSoon}</p>
            <p className="text-[10px] font-bold uppercase text-gray-500">90 days</p>
          </div>
          <div className="rounded-2xl bg-[#14151b] border border-[#2a2b36] p-3">
            <p className="text-lg font-black text-emerald-300">{reviewedCount}</p>
            <p className="text-[10px] font-bold uppercase text-gray-500">Reviewed</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
            className="bg-[#14151b] border border-[#2a2b36] rounded-xl px-3 py-2 text-xs text-white outline-none">
            {owners.map(owner => <option key={owner} value={owner}>{owner === 'All' ? 'All people' : owner}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-[#14151b] border border-[#2a2b36] rounded-xl px-3 py-2 text-xs text-white outline-none">
            {categories.map(category => <option key={category} value={category}>{category === 'All' ? 'All categories' : category}</option>)}
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#2a2b36] bg-[#14151b] px-3 py-2">
          <button onClick={toggleSelectAll} disabled={!filteredFiles.length}
            className="flex items-center gap-2 text-xs font-bold text-gray-300 disabled:opacity-40">
            {allFilteredSelected ? <CheckSquare className="w-4 h-4 text-indigo-300"/> : <Square className="w-4 h-4"/>}
            {allFilteredSelected ? 'Clear visible' : 'Select visible'}
          </button>
          <span className="text-[11px] font-bold uppercase text-gray-500">{selectedCount} selected</span>
        </div>

        {selectedCount > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-2">
            <button onClick={bulkOcr} disabled={!!bulkBusy} className="flex flex-col items-center gap-1 rounded-xl bg-[#0b0c10] py-2 text-[10px] font-bold text-indigo-200 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${bulkBusy === 'OCR' ? 'animate-spin' : ''}`}/> OCR
            </button>
            <button onClick={bulkEmail} disabled={!!bulkBusy} className="flex flex-col items-center gap-1 rounded-xl bg-[#0b0c10] py-2 text-[10px] font-bold text-emerald-200 disabled:opacity-50">
              <Mail className="w-4 h-4"/> Email
            </button>
            <button onClick={bulkExport} disabled={!!bulkBusy} className="flex flex-col items-center gap-1 rounded-xl bg-[#0b0c10] py-2 text-[10px] font-bold text-blue-200 disabled:opacity-50">
              <Download className="w-4 h-4"/> Export
            </button>
            <button onClick={bulkDelete} disabled={!!bulkBusy} className="flex flex-col items-center gap-1 rounded-xl bg-[#0b0c10] py-2 text-[10px] font-bold text-red-200 disabled:opacity-50">
              <Trash2 className="w-4 h-4"/> Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-24">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"/></div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <FolderOpen className="w-16 h-16 text-gray-500 mb-4" />
            <p className="text-lg font-bold text-white mb-1">{files.length ? 'No matches' : 'Your Vault is Empty'}</p>
            <p className="text-sm text-gray-400 max-w-[220px]">{files.length ? 'Change the person or category filter.' : 'Upload PDFs, IDs, and contracts to securely store and query them.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFiles.map((f) => {
              const meta = f._meta;
              const scanStatus = meta.scanStatus;
              const scanAttempts = meta.scanAttempts;
              const scanError = meta.scanError;
              const expiryDays = daysUntil(meta.expiry);
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
                  <button onClick={(event) => { event.stopPropagation(); toggleSelected(f.id); }}
                    className="shrink-0 text-gray-500 hover:text-indigo-300"
                    aria-label={`${selectedIds.includes(f.id) ? 'Deselect' : 'Select'} ${f.title}`}>
                    {selectedIds.includes(f.id) ? <CheckSquare className="w-5 h-5 text-indigo-300"/> : <Square className="w-5 h-5"/>}
                  </button>
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
                      {meta.owner && !f.tags && (
                        <span className="bg-blue-500/15 text-blue-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {meta.owner}
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
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">{f.subtitle}</p>
                      {meta.expiry && (
                        <span className={`text-[10px] font-bold ${expiryDays !== null && expiryDays <= 90 ? 'text-amber-300' : 'text-gray-500'}`}>
                          exp {meta.expiry}
                        </span>
                      )}
                    </div>
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
            <button onClick={() => beginReview(selectedFile)} className="p-2 bg-[#1a1b23] rounded-xl text-gray-400 hover:text-emerald-300 transition-colors" title="Review OCR">
              <Pencil className="w-5 h-5"/>
            </button>
          </div>
          {(() => {
            const meta = vaultMeta(selectedFile);
            return (
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-[#1a1b23] bg-[#101117]">
                <div className="rounded-xl bg-[#1a1b23] px-3 py-2">
                  <p className="text-[10px] uppercase text-gray-500 font-bold">Owner</p>
                  <p className="text-xs text-white truncate">{meta.owner || 'Unknown'}</p>
                </div>
                <div className="rounded-xl bg-[#1a1b23] px-3 py-2">
                  <p className="text-[10px] uppercase text-gray-500 font-bold">Category</p>
                  <p className="text-xs text-white truncate">{meta.category}</p>
                </div>
                <div className="rounded-xl bg-[#1a1b23] px-3 py-2">
                  <p className="text-[10px] uppercase text-gray-500 font-bold">Expiry</p>
                  <p className="text-xs text-white truncate">{meta.expiry || 'None'}</p>
                </div>
              </div>
            );
          })()}
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

      {reviewFile && reviewForm && (
        <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[88%] overflow-y-auto rounded-t-3xl bg-[#14151b] border-t border-[#2a2b36] p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-white">Review OCR</h3>
                <p className="text-xs text-gray-500">Correct the searchable document metadata.</p>
              </div>
              <button onClick={() => setReviewFile(null)} className="p-2 text-gray-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              {[
                ['title', 'Title', FileText],
                ['category', 'Category', FolderOpen],
                ['owner', 'Person / employee', UserRound],
                ['expiry_date', 'Expiry date', CalendarClock],
              ].map(([key, label, Icon]) => (
                <label key={key} className="block">
                  <span className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase text-gray-500"><Icon className="w-3.5 h-3.5"/>{label}</span>
                  <input value={reviewForm[key]} onChange={e => setReviewForm(form => ({ ...form, [key]: e.target.value }))}
                    className="w-full rounded-xl bg-[#0b0c10] border border-[#2a2b36] px-3 py-3 text-sm text-white outline-none focus:border-indigo-400"/>
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase text-gray-500">Summary</span>
                <textarea value={reviewForm.summary} onChange={e => setReviewForm(form => ({ ...form, summary: e.target.value }))}
                  className="h-20 w-full rounded-xl bg-[#0b0c10] border border-[#2a2b36] px-3 py-3 text-sm text-white outline-none focus:border-indigo-400"/>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase text-gray-500">Search text</span>
                <textarea value={reviewForm.full_text} onChange={e => setReviewForm(form => ({ ...form, full_text: e.target.value }))}
                  className="h-28 w-full rounded-xl bg-[#0b0c10] border border-[#2a2b36] px-3 py-3 text-sm text-white outline-none focus:border-indigo-400"/>
              </label>
            </div>
            <button onClick={saveReview} disabled={savingReview}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-black text-white disabled:opacity-60 flex items-center justify-center gap-2">
              <Check className="w-5 h-5"/>{savingReview ? 'Saving...' : 'Save review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
