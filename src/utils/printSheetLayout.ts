// Keep paper in normal document flow, independently of centered/scrolling modals.
export function printSheetLayout(id: string): string {
  if (!['masterlist-printable-sheet', 'distribution-recall-sheet'].includes(id)) return '';
  const sheet = `#${id}`;
  return `@media print {
    @page { size: A4 portrait; margin: 10mm; }
    html:has(${sheet}) { font-size: 16px !important; }
    body:has(${sheet}) *:has(${sheet}) {
      display: block !important; position: static !important; inset: auto !important;
      width: 100% !important; max-width: none !important;
      height: auto !important; min-height: 0 !important; max-height: none !important;
      overflow: visible !important; margin: 0 !important; padding: 0 !important;
      transform: none !important; filter: none !important; backdrop-filter: none !important;
      border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: white !important;
    }
    body:has(${sheet}) > :not(:has(${sheet})):not(${sheet}),
    body:has(${sheet}) *:has(${sheet}) > :not(:has(${sheet})):not(${sheet}) { display: none !important; }
    ${sheet} {
      display: block !important; position: static !important; inset: auto !important;
      width: 100% !important; max-width: none !important;
      height: auto !important; min-height: 0 !important; max-height: none !important;
      overflow: visible !important; margin: 0 !important; padding: 0 !important;
      border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
      color: black !important; background: white !important;
    }
    ${sheet} > header { display: grid !important; }
    ${sheet} thead { display: table-header-group; }
    ${sheet} tr { break-inside: avoid; }
  }`;
}
