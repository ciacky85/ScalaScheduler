'use client';

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { RigaCalendario } from '@/lib/types';
import { ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parse } from 'date-fns';
import { it } from 'date-fns/locale';

interface TabellaCalendarioProps {
  rows: RigaCalendario[];
  onRowsChange: (rows: RigaCalendario[]) => void;
  /** Significato del "*" da inserire in descrizione quando digitato */
  asteriskMeaning?: string;
}

type SortKey = keyof RigaCalendario | 'data';
type SortDirection = 'asc' | 'desc';

const hardTrim = (s: string) =>
  (s ?? '')
    .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
    .replace(/[–—]/g, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const dropIfOnlyDashes = (s: string) => hardTrim(s).replace(/^-+$/g, '').trim();

export default function TabellaCalendario({ rows, onRowsChange, asteriskMeaning = '' }: TabellaCalendarioProps) {
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
    key: 'data',
    direction: 'asc',
  });

  const handleSelectRow = (id: string, checked: boolean) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, selected: checked } : row)));
  };

  const handleSelectAll = (checked: boolean) => {
    onRowsChange(rows.map((row) => (row.stato === 'ok' ? { ...row, selected: checked } : row)));
  };

  const handleFieldChange = (id: string, field: keyof RigaCalendario, value: string) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const isAllSelected = useMemo(() => {
    const selectableRows = rows.filter((r) => r.stato === 'ok');
    return selectableRows.length > 0 && selectableRows.every((r) => r.selected);
  }, [rows]);

  const getMergedDescrizione = (row: RigaCalendario) => {
    const base = hardTrim(row.descrizione ?? '');
    const dett = dropIfOnlyDashes((row as any).dettaglio ?? '');
    // nessun trattino: unisci solo con spazio se esiste testo
    const merged = dett ? `${base} ${hardTrim(String(dett))}` : base;
    // niente asterischi visivi doppi, niente trattini generati
    return hardTrim(merged.replace(/\*/g, '*'));
  };

  const sortedRows = useMemo(() => {
    let sortableItems = [...rows];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'data') {
          const dateA = parse(a.data, 'dd/MM/yyyy', new Date());
          const dateB = parse(b.data, 'dd/MM/yyyy', new Date());
          if (dateA < dateB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA == null || valB == null) return 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [rows, sortConfig]);

  const filteredRows = useMemo(() => {
    return sortedRows.filter((row) => {
      const merged = getMergedDescrizione(row).toLowerCase();
      return merged.includes(filterText.toLowerCase()) || (row.luogo ?? '').toLowerCase().includes(filterText.toLowerCase());
    });
  }, [sortedRows, filterText]);

  const handleDescrizioneEdit = (row: RigaCalendario, rawValue: string) => {
    // sostituisci "*" digitato con "* <meaning>" senza trattino e senza duplicati
    let value = hardTrim(rawValue);
    if (/\*/.test(value) && asteriskMeaning.trim()) {
      const withoutStar = hardTrim(value.replace(/\*/g, ' '));
      const starMeaning = `* ${asteriskMeaning}`;
      const already = new RegExp(`${starMeaning.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(withoutStar);
      value = already ? withoutStar : (withoutStar ? `${withoutStar} ${starMeaning}` : starMeaning);
    }
    // Convergi su una colonna
    let nextRows = rows.map((r) => (r.id === row.id ? { ...r, descrizione: value } : r));
    // @ts-ignore
    nextRows = nextRows.map((r) => (r.id === row.id ? { ...r, dettaglio: '' } : r));
    onRowsChange(nextRows);
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filtra per descrizione o luogo..."
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        className="max-w-sm"
        aria-label="Filtra eventi"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  checked={isAllSelected}
                  aria-label="Seleziona tutti gli eventi validi"
                />
              </TableHead>
              <TableHead className="w-[150px]">
                <Button variant="ghost" onClick={() => requestSort('giornoSettimanale')}>
                  Giorno
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[150px]">
                <Button variant="ghost" onClick={() => requestSort('data')}>
                  Data
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[100%]">Descrizione</TableHead>
              <TableHead className="w-[110px] text-center">Luogo</TableHead>
              <TableHead className="w-[200px] text-center">Fascia 1</TableHead>
              <TableHead className="w-[200px] text-center">Fascia 2</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => {
              const merged = getMergedDescrizione(row);
              return (
                <TableRow key={row.id} data-state={row.selected ? 'selected' : undefined} className={row.stato === 'da_revisionare' ? 'bg-destructive/10' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={(checked) => handleSelectRow(row.id, checked === true)}
                      disabled={row.stato === 'da_revisionare'}
                      aria-label={`Seleziona evento ${merged}`}
                    />
                  </TableCell>
                  <TableCell>{row.giornoSettimanale}</TableCell>
                  <TableCell>
                    {row.stato === 'da_revisionare' ? (
                      <Badge variant="destructive">Da Revisionare</Badge>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" className="px-2" disabled={row.stato === 'da_revisionare'}>
                            {row.data}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parse(row.data, 'dd/MM/yyyy', new Date())}
                            onSelect={(date) => date && handleFieldChange(row.id, 'data', format(date, 'dd/MM/yyyy'))}
                            initialFocus
                            locale={it}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={merged}
                      onChange={(e) => handleDescrizioneEdit(row, e.target.value)}
                      className="border-0 bg-transparent"
                      style={{ width: '100%', minWidth: 300 }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      value={row.luogo}
                      onChange={(e) => handleFieldChange(row.id, 'luogo', e.target.value)}
                      className="border-0 bg-transparent text-center"
                      style={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Input value={row.fascia1Start || ''} onChange={(e) => handleFieldChange(row.id, 'fascia1Start', e.target.value)} className="w-20 border-0 bg-transparent text-center" placeholder="HH:mm" />
                      <span>-</span>
                      <Input value={row.fascia1End || ''} onChange={(e) => handleFieldChange(row.id, 'fascia1End', e.target.value)} className="w-20 border-0 bg-transparent text-center" placeholder="HH:mm" />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Input value={row.fascia2Start || ''} onChange={(e) => handleFieldChange(row.id, 'fascia2Start', e.target.value)} className="w-20 border-0 bg-transparent text-center" placeholder="HH:mm" />
                      <span>-</span>
                      <Input value={row.fascia2End || ''} onChange={(e) => handleFieldChange(row.id, 'fascia2End', e.target.value)} className="w-20 border-0 bg-transparent text-center" placeholder="HH:mm" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Nessun risultato.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
