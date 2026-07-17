'use client';

import { useCallback, useEffect, useState } from 'react';
import { DOCUMENTS_CHANGED, fetchDocuments } from '@/lib/documents-client';
import { documentNeedsReview } from '@/lib/types';

/**
 * Lightweight shared count for nav / dashboard (cloud Document Review store).
 */
export function useDocumentsSummary() {
  const [total, setTotal] = useState(0);
  const [needsReview, setNeedsReview] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchDocuments();
      if (result.error) {
        setTotal(0);
        setNeedsReview(0);
      } else {
        setTotal(result.documents.length);
        setNeedsReview(result.documents.filter(documentNeedsReview).length);
      }
    } catch {
      setTotal(0);
      setNeedsReview(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(DOCUMENTS_CHANGED, onChange);
    return () => window.removeEventListener(DOCUMENTS_CHANGED, onChange);
  }, [refresh]);

  return { total, needsReview, loading, refresh };
}
