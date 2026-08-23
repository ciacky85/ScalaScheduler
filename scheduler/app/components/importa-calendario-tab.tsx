'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RigaCalendario } from '@/lib/types';
import UploadPdf from './importa-calendario/upload-pdf';
import TabellaCalendario from './tabella-calendario';
import ExportControls from './export-controls';
import { AnimatePresence, motion } from 'framer-motion';

interface ImportaCalendarioTabProps {
  parsedData: {
    mese: string;
    anno: number;
    righe: RigaCalendario[];
  } | null;
  setParsedData: (data: { mese: string; anno: number; righe: RigaCalendario[] } | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function ImportaCalendarioTab({
  parsedData,
  setParsedData,
  isLoading,
  setIsLoading,
}: ImportaCalendarioTabProps) {

  const handlePdfParse = (data: { mese: string; anno: number; righe: RigaCalendario[] }) => {
    setParsedData(data);
    setIsLoading(false);
  };
  
  const handleRowsChange = (newRows: RigaCalendario[]) => {
      if (parsedData) {
          setParsedData({ ...parsedData, righe: newRows });
      }
  };

  const selectedRows = useMemo(() => parsedData?.righe.filter(r => r.selected) || [], [parsedData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importa Calendario da PDF</CardTitle>
        <CardDescription>
          Carica il programma di lavoro in formato PDF per estrarre gli eventi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <UploadPdf onParse={handlePdfParse} setIsLoading={setIsLoading} isLoading={isLoading} />
        
        <AnimatePresence>
        {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-center p-8 space-x-2"
            >
              <div className="w-4 h-4 rounded-full bg-primary animate-pulse" style={{animationDelay: '0s'}}></div>
              <div className="w-4 h-4 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-4 h-4 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.4s'}}></div>
              <p className="text-muted-foreground">Analisi del PDF in corso...</p>
            </motion.div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {parsedData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-semibold font-headline">
                Eventi estratti da: {parsedData.mese} {parsedData.anno}
              </h3>
              <ExportControls selectedRows={selectedRows} tipo="importaCalendario" />
              <TabellaCalendario rows={parsedData.righe} onRowsChange={handleRowsChange} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
