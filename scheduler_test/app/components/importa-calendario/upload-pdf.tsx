'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { estraiProgrammaCoro } from '@/lib/pdf/estraiProgrammaCoro';
import type { RigaCalendario } from '@/lib/types';
import { Upload } from 'lucide-react';
import React, { useRef } from 'react';
import { useToast } from "@/hooks/use-toast"


interface UploadPdfProps {
  onParse: (data: { mese: string; anno: number; righe: RigaCalendario[] }) => void;
  setIsLoading: (loading: boolean) => void;
  isLoading: boolean;
}

export default function UploadPdf({ onParse, setIsLoading, isLoading }: UploadPdfProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        const data = await estraiProgrammaCoro(file);
        onParse(data);
        toast({
          title: "PDF Analizzato",
          description: "Gli eventi sono stati estratti con successo.",
        })
      } catch (error) {
        console.error("Error parsing PDF:", error);
        toast({
          variant: "destructive",
          title: "Errore di Analisi",
          description: "Impossibile analizzare il file PDF.",
        })
        setIsLoading(false);
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <Input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf"
        aria-label="Carica PDF"
      />
      <Button onClick={handleButtonClick} disabled={isLoading}>
        <Upload className="mr-2 h-4 w-4" />
        Carica PDF Programma
      </Button>
    </div>
  );
}
