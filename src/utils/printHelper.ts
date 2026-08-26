/**
 * Robust Cross-Environment Print Utility
 * Handles iframe restrictions, AI Studio sandbox constraints,
 * and standard desktop browser printing.
 */

export function generateStandalonePrintHtml(elementId: string, documentTitle: string = 'DCS Document'): string {
  const element = document.getElementById(elementId);
  if (!element) return '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Prompt', sans-serif;
      background-color: #ffffff;
      color: #0f172a;
      margin: 0;
      padding: 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
  </style>
</head>
<body class="bg-white">
  <!-- Print Control Bar (Hidden on paper/PDF) -->
  <div class="no-print mb-6 p-4 bg-slate-900 text-white rounded-xl shadow-lg flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-xl">🖨️</span>
      <div>
        <h2 class="text-sm font-bold text-white">${documentTitle}</h2>
        <p class="text-xs text-slate-400">หน้าต่างพิมพ์เอกสารควบคุมมาตรฐาน ISO (พร้อมพิมพ์ A4 / บันทึก PDF)</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="window.print()" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow">
        สั่งพิมพ์ / บันทึก PDF ตอนนี้ (Print)
      </button>
      <button onclick="window.close()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg cursor-pointer">
        ปิดหน้าต่าง
      </button>
    </div>
  </div>

  <!-- Document Content Container -->
  <div class="max-w-4xl mx-auto">
    ${element.outerHTML}
  </div>

  <script>
    // Auto trigger print dialog after page styles render
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch(e) {
          console.warn('Auto print trigger:', e);
        }
      }, 500);
    });
  </script>
</body>
</html>`;
}

/**
 * Print by opening in a new tab (bypasses iframe sandbox print restrictions)
 */
export function openPrintInNewTab(elementId: string, documentTitle: string = 'DCS Document'): boolean {
  try {
    const htmlContent = generateStandalonePrintHtml(elementId, documentTitle);
    if (!htmlContent) return false;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const printWindow = window.open(blobUrl, '_blank');
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      // Pop-up was blocked, fallback to direct download or iframe print
      downloadPrintableHtml(elementId, documentTitle);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error opening print in new tab:', error);
    return false;
  }
}

/**
 * Download Standalone HTML file (guaranteed fallback for any device / browser)
 */
export function downloadPrintableHtml(elementId: string, documentTitle: string = 'DCS Document') {
  try {
    const htmlContent = generateStandalonePrintHtml(elementId, documentTitle);
    if (!htmlContent) return;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${documentTitle.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('Download printable failed:', err);
  }
}

/**
 * Main print launcher with multi-tier fallback
 */
export function printElementById(elementId: string, documentTitle: string = 'DCS Document') {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    window.print();
    return;
  }

  // Set ID attribute for media print CSS
  targetElement.setAttribute('data-print-target', 'true');
  document.body.classList.add('dcs-printing-active');

  // Try direct window.print first
  let directPrintSucceeded = false;
  try {
    window.print();
    directPrintSucceeded = true;
  } catch (e) {
    console.warn('Native window.print blocked in iframe, opening new tab...', e);
  }

  setTimeout(() => {
    document.body.classList.remove('dcs-printing-active');
  }, 1000);

  // If in iframe environment where window.print() might be restricted or silent
  const isInIframe = window.self !== window.top;
  if (isInIframe || !directPrintSucceeded) {
    openPrintInNewTab(elementId, documentTitle);
  }
}
