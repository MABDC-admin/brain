import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, FileText, AlertTriangle } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

export default function SharedDocumentPage() {
  const { token } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/shared/${token}`)
      .then(async r => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.detail || 'Link invalid or expired');
        }
        return r.json();
      })
      .then(data => {
        setDoc(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="flex-1 bg-[#0b0c10] text-white flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"/>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 bg-[#0b0c10] text-white flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4"/>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  const sharedFileUrl = doc.image_url ? `${API}/api/shared/${token}/file` : '';

  return (
    <div className="flex-1 bg-[#0b0c10] text-white min-h-screen flex flex-col items-center py-12 px-6">
      <div className="max-w-2xl w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Lock className="w-6 h-6 text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-bold">Secure Share</h1>
            <p className="text-sm text-gray-500">24-hour encrypted link</p>
          </div>
        </div>

        <div className="bg-[#14151b] border border-[#2a2b36] rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-4 mb-6 border-b border-[#2a2b36] pb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#0b0c10] border border-[#2a2b36] flex items-center justify-center">
              <FileText className="w-8 h-8 text-indigo-400"/>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{doc.title}</h2>
              <p className="text-gray-400 mt-1">{doc.subtitle}</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            {sharedFileUrl && (
              <div className="mb-6">
                <a
                  href={sharedFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
                >
                  Open shared file
                </a>
              </div>
            )}
            {doc.body ? (
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap font-serif text-lg">
                {doc.body}
              </div>
            ) : (
              <p className="text-gray-500 italic">No document text available.</p>
            )}
          </div>
        </div>
        
        <p className="text-center text-xs text-gray-600 mt-8">Powered by Command Brain Vault</p>
      </div>
    </div>
  );
}
