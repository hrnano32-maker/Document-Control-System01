import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  FileText,
  X,
  Download,
  ExternalLink,
  Printer,
  FileCheck,
  FolderSync,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Save,
  Copy,
  Check,
  Eye,
  Info,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Shield,
  FileSpreadsheet,
  FileCode,
  FileBox,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const DocumentViewerModal: React.FC = () => {
  const {
    selectedDocumentForView,
    setSelectedDocumentForView,
    updateDriveLink,
    currentUser,
  } = useDcs();

  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [activeTab, setActiveTab] = useState<'preview' | 'file-info' | 'properties'>('preview');

  useEffect(() => {
    if (selectedDocumentForView) {
      setZoomLevel(100);
      setRotation(0);
      setActiveTab('preview');
    }
  }, [selectedDocumentForView]);

  if (!selectedDocumentForView) return null;

  const doc = selectedDocumentForView;

  const fileExt = (doc.fileName || '').split('.').pop()?.toLowerCase() || '';
  const isPdf = fileExt === 'pdf' || (doc.fileType && doc.fileType.includes('pdf'));
  const isImage = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(fileExt) || 
    (doc.fileType && doc.fileType.startsWith('image/')) ||
    Boolean(doc.fileDataUrl && doc.fileDataUrl.startsWith('data:image/'));

  const handleClose = () => {
    setSelectedDocumentForView(null);
  };

  const handleDownload = () => {
    const fileName = doc.fileName || `${doc.docNo || 'DOCUMENT'}_Rev${doc.revision || '00'}.${isPdf ? 'pdf' : isImage ? 'png' : 'docx'}`;

    if (doc.fileDataUrl) {
      // Direct binary download from stored DataURL
      const link = document.createElement('a');
      link.href = doc.fileDataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Generate comprehensive quality document text/html content
    const documentContent = `================================================================================
ระบบควบคุมเอกสารอิเล็กทรอนิกส์ (DOCUMENT CONTROL SYSTEM - DCS)
อ้างอิงระเบียบปฏิบัติ: QP-QS-001 (Rev.09) ระเบียบปฏิบัติการควบคุมเอกสาร
ข้อกำหนดคุณภาพ: ISO 9001:2015 Clause 7.5 / IATF 16949 / VSCC VSTD NO.27
================================================================================

[หัวเรื่องเอกสาร]
รหัสเอกสาร (Doc No):       ${doc.docNo || 'N/A'}
ประเภทเอกสาร (Type):       ${doc.docType || 'N/A'}
ชื่อเอกสาร (ภาษาไทย):      ${doc.docNameTh || doc.title || 'N/A'}
ชื่อเอกสาร (English):      ${doc.docNameEn || 'N/A'}
ครั้งที่แก้ไข (Revision):      Rev.${doc.revision || '00'}
หน่วยงานผู้ถือครอง (Dept):   ${doc.dept || 'N/A'}
วันที่มีผลบังคับใช้ (Date):   ${doc.effectiveDate || new Date().toISOString().split('T')[0]}
สถานะเอกสาร:               ${doc.isControlledCopy ? 'CONTROLLED COPY (ฉบับควบคุม)' : 'DRAFT / UNDER REVIEW'}

--------------------------------------------------------------------------------
1. วัตถุประสงค์ (PURPOSE & SCOPE)
เอกสารฉบับนี้จัดทำขึ้นเพื่อกำหนดมาตรฐานและขั้นตอนการปฏิบัติงานสำหรับ ${doc.docNameTh || doc.title}
เพื่อให้การดำเนินงานสอดคล้องตามมาตรฐานระบบบริหารงานคุณภาพ ISO 9001:2015 และ IATF 16949

2. เหตุผลความจำเป็นในการขอดำเนินการ (REASON FOR ACTION)
${doc.reasonForChange || 'จัดทำขึ้นตามข้อกำหนดระบบบริหารคุณภาพและมาตรฐานการควบคุมกระบวนการผลิต'}

3. รายละเอียดการเปลี่ยนแปลง / ขั้นตอนการปฏิบัติงาน (PROCEDURE DETAILS)
${doc.changeDetails || 'ขั้นตอนการปฏิบัติงานและเกณฑ์ควบคุมตามมาตรฐานระเบียบปฏิบัติงานขององค์กร'}

4. การควบคุมและจัดเก็บ (DOCUMENT RETENTION & STORAGE)
- ฉบับควบคุม (Controlled Copy) จัดเก็บในระบบฐานข้อมูล DCS และ Google Drive Controlled Archive
- ระยะเวลาการจัดเก็บ: 5 ปี นับจากวันยกเลิกเอกสาร
- สถานที่จัดเก็บ: แผนกควบคุมเอกสาร (DCC) และจุดปฏิบัติงานที่เกี่ยวข้อง

5. ข้อมูลการอ้างอิง (REFERENCE LINK)
Google Drive URL: ${doc.driveLink || 'https://drive.google.com/drive/folders/dcc-controlled-archive'}

================================================================================
ดาวน์โหลดจากระบบ DCS เมื่อ: ${new Date().toLocaleString('th-TH')}
ผู้ดาวน์โหลด: ${currentUser.userName} (${currentUser.currentDept})
================================================================================`;

    const blob = new Blob([documentContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.txt') ? fileName : `${fileName.split('.')[0]}_DETAILS.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenInNewTab = () => {
    if (!doc.fileDataUrl) return;

    try {
      // If it's a data URL, convert to Blob URL for clean new-tab opening
      const byteCharacters = atob(doc.fileDataUrl.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: doc.fileType || 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      window.open(doc.fileDataUrl, '_blank');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="document-viewer-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150 my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-indigo-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              {isPdf ? (
                <FileText className="w-5 h-5 text-rose-300" />
              ) : isImage ? (
                <Eye className="w-5 h-5 text-cyan-300" />
              ) : (
                <FileCheck className="w-5 h-5 text-indigo-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/30 border border-indigo-400/40 text-[11px] font-mono font-bold text-indigo-200">
                  {doc.docNo || 'DRAFT-DOC'}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-mono font-bold text-emerald-300">
                  Rev.{doc.revision || '00'}
                </span>
                {doc.docType && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[11px] font-bold text-amber-300">
                    {doc.docType}
                  </span>
                )}
                {doc.dept && (
                  <span className="text-[11px] text-slate-300 font-semibold">
                    แผนก: {doc.dept}
                  </span>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
                {doc.docNameTh || doc.title || 'เอกสารระบบควบคุมคุณภาพ'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="ดาวน์โหลดไฟล์ลงเครื่อง"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ดาวน์โหลด</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer hidden sm:flex"
              title="พิมพ์เอกสาร (Print)"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Header Toolbar & Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              ตัวอย่างเอกสาร (Preview)
            </button>
            <button
              onClick={() => setActiveTab('file-info')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'file-info'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FolderSync className="w-3.5 h-3.5" />
              ข้อมูลไฟล์แนบ (File Info)
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'properties'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              ข้อมูลจำเพาะ (Metadata)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              ดาวน์โหลดเอกสารฉบับนี้
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60">
          
          {/* TAB 1: PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              
              {/* If uploaded attachment exists (PDF, Image, Office Doc) */}
              {doc.fileDataUrl && (
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        {isPdf ? (
                          <FileText className="w-4 h-4 text-rose-600" />
                        ) : isImage ? (
                          <Eye className="w-4 h-4 text-cyan-600" />
                        ) : (
                          <FileBox className="w-4 h-4 text-indigo-600" />
                        )}
                        {doc.fileName || 'uploaded_document'}
                      </span>
                      {doc.fileSize && <span className="text-slate-400">({doc.fileSize})</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      {isPdf && (
                        <button
                          type="button"
                          onClick={handleOpenInNewTab}
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                          เปิดดู PDF ในแท็บใหม่
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-600" />
                        ดาวน์โหลดไฟล์แนบ
                      </button>

                      {isImage && (
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 ml-2">
                          <button
                            onClick={() => setZoomLevel(prev => Math.max(50, prev - 15))}
                            className="p-1 hover:bg-white rounded text-slate-700 cursor-pointer"
                            title="Zoom Out"
                          >
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-1 text-[11px] font-mono">{zoomLevel}%</span>
                          <button
                            onClick={() => setZoomLevel(prev => Math.min(200, prev + 15))}
                            className="p-1 hover:bg-white rounded text-slate-700 cursor-pointer"
                            title="Zoom In"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setRotation(prev => (prev + 90) % 360)}
                            className="p-1 hover:bg-white rounded text-slate-700 cursor-pointer ml-1"
                            title="Rotate"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Image render if image */}
                  {isImage && (
                    <div className="w-full min-h-[350px] flex items-center justify-center bg-slate-900 rounded-lg p-4 overflow-auto">
                      <img
                        src={doc.fileDataUrl}
                        alt="Attached Document"
                        style={{
                          transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                          transition: 'transform 0.2s ease',
                        }}
                        className="max-h-[450px] object-contain rounded shadow-lg"
                      />
                    </div>
                  )}

                  {/* PDF Notification Banner */}
                  {isPdf && (
                    <div className="p-3.5 bg-gradient-to-r from-rose-50 to-indigo-50 border border-rose-200/80 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="font-bold text-slate-900 text-xs">ไฟล์แนบ PDF ต้นฉบับพร้อมใช้งาน</h5>
                          <p className="text-[11px] text-slate-600">
                            คุณสามารถคลิกเพื่อเปิดดูไฟล์ PDF แบบเต็มจอในแท็บใหม่ หรืออ่านเนื้อหาโครงสร้างระเบียบปฏิบัติด้านล่าง
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenInNewTab}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        เปิดอ่านไฟล์ PDF
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* High Fidelity QMS Document Paper Sheet Preview (Always visible so users can read the structured document contents) */}
              <div className="bg-white rounded-xl shadow-md border border-slate-300 p-6 sm:p-8 max-w-4xl mx-auto space-y-6 text-slate-800 print:shadow-none print:border-none">
                  
                  {/* Document Header Table */}
                  <div className="border-2 border-slate-900 text-xs">
                    <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900">
                      <div className="col-span-3 p-3 flex flex-col justify-center items-center text-center bg-slate-50">
                        <span className="font-black text-indigo-950 text-sm tracking-wider">NANO TECH</span>
                        <span className="text-[10px] text-slate-600 font-semibold">QMS ISO 9001 / IATF 16949</span>
                      </div>
                      <div className="col-span-6 p-3 flex flex-col justify-center text-center">
                        <span className="font-bold text-slate-500 text-[10px]">เอกสารระบบบริหารคุณภาพ (QUALITY DOCUMENT)</span>
                        <span className="font-bold text-slate-900 text-sm mt-0.5">{doc.docNameTh || doc.title}</span>
                        {doc.docNameEn && (
                          <span className="text-[11px] text-slate-600 font-medium italic">{doc.docNameEn}</span>
                        )}
                      </div>
                      <div className="col-span-3 p-2 text-[11px] space-y-1 bg-slate-50">
                        <div className="flex justify-between font-mono">
                          <span className="font-bold">Doc No:</span>
                          <span className="font-black text-indigo-900">{doc.docNo || 'QP-QS-001'}</span>
                        </div>
                        <div className="flex justify-between font-mono">
                          <span className="font-bold">Revision:</span>
                          <span className="font-bold text-rose-700">Rev.{doc.revision || '00'}</span>
                        </div>
                        <div className="flex justify-between font-mono text-[10px]">
                          <span>Effective:</span>
                          <span>{doc.effectiveDate || new Date().toISOString().split('T')[0]}</span>
                        </div>
                        <div className="flex justify-between font-mono text-[10px]">
                          <span>Dept:</span>
                          <span className="font-bold">{doc.dept || 'DCC'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Controlled Stamp Indicator Watermark */}
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-slate-800">การควบคุมเอกสาร:</span>
                      <span className="text-slate-600">สอดคล้องตามข้อกำหนด ISO 9001:2015 Clause 7.5 & QP-QS-001</span>
                    </div>
                    <div className="px-2.5 py-0.5 bg-rose-50 border border-rose-300 text-rose-700 font-mono font-bold text-[10px] rounded tracking-wider">
                      {doc.isControlledCopy ? 'CONTROLLED COPY' : 'DRAFT / PROPOSED REVISION'}
                    </div>
                  </div>

                  {/* Section 1: Objective & Reason */}
                  <div className="space-y-2 text-xs">
                    <h5 className="font-bold text-slate-900 text-sm border-b pb-1 border-slate-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">1</span>
                      วัตถุประสงค์และเหตุผลความจำเป็นในการขอดำเนินการ (Objective & Purpose)
                    </h5>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 leading-relaxed font-sans">
                      {doc.reasonForChange || 'จัดทำและทบทวนเอกสารตามมาตรฐานระบบบริหารงานคุณภาพ ISO 9001:2015 และ IATF 16949 เพื่อให้กระบวนการดำเนินงานมีประสิทธิภาพและสามารถตรวจสอบย้อนกลับได้'}
                    </div>
                  </div>

                  {/* Section 2: Change Details */}
                  {doc.changeDetails && (
                    <div className="space-y-2 text-xs">
                      <h5 className="font-bold text-slate-900 text-sm border-b pb-1 border-slate-300 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">2</span>
                        สรุปสาระสำคัญที่มีการเปลี่ยนแปลง (Change Summary)
                      </h5>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 leading-relaxed font-sans whitespace-pre-line">
                        {doc.changeDetails}
                      </div>
                    </div>
                  )}

                  {/* Section 3: Standard Procedure Structure */}
                  <div className="space-y-2 text-xs">
                    <h5 className="font-bold text-slate-900 text-sm border-b pb-1 border-slate-300 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">3</span>
                      โครงสร้างระเบียบปฏิบัติและขั้นตอนการควบคุม (Operational Control Flow)
                    </h5>
                    <div className="border border-slate-200 rounded-lg overflow-hidden text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                          <tr>
                            <th className="p-2 w-12 text-center">ลำดับ</th>
                            <th className="p-2 w-36">ขั้นตอนการทำงาน</th>
                            <th className="p-2">รายละเอียดข้อกำหนดและวิธีปฏิบัติ</th>
                            <th className="p-2 w-28">ผู้รับผิดชอบ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-sans">
                          <tr>
                            <td className="p-2 text-center font-bold">3.1</td>
                            <td className="p-2 font-bold text-slate-800">การเตรียมความพร้อม</td>
                            <td className="p-2 text-slate-600">ตรวจสอบความพร้อมของเครื่องมือ เอกสารอ้างอิง และข้อมูลนำเข้าตามเกณฑ์กำหนด</td>
                            <td className="p-2 text-slate-700 font-semibold">{doc.dept || 'เจ้าหน้าที่ประจำหน่วยงาน'}</td>
                          </tr>
                          <tr className="bg-slate-50/50">
                            <td className="p-2 text-center font-bold">3.2</td>
                            <td className="p-2 font-bold text-slate-800">การดำเนินการตามมาตรฐาน</td>
                            <td className="p-2 text-slate-600">ปฏิบัติตามข้อกำหนดในคู่มือและระเบียบปฏิบัติงานอย่างเคร่งครัด บันทึกผลในแบบฟอร์มคุณภาพ</td>
                            <td className="p-2 text-slate-700 font-semibold">{doc.dept || 'พนักงานปฏิบัติการ'}</td>
                          </tr>
                          <tr>
                            <td className="p-2 text-center font-bold">3.3</td>
                            <td className="p-2 font-bold text-slate-800">การตรวจสอบและควบคุม</td>
                            <td className="p-2 text-slate-600">ตรวจสอบความถูกต้อง เปรียบเทียบกับข้อกำหนดมาตรฐาน บันทึกผลการตรวจสอบและรายงานผล</td>
                            <td className="p-2 text-slate-700 font-semibold">QA / หัวหน้างาน</td>
                          </tr>
                          <tr className="bg-slate-50/50">
                            <td className="p-2 text-center font-bold">3.4</td>
                            <td className="p-2 font-bold text-slate-800">การจัดเก็บบันทึกคุณภาพ</td>
                            <td className="p-2 text-slate-600">รวบรวมบันทึกคุณภาพ จัดเก็บตามระยะเวลาที่ระบุในตารางควบคุมบันทึก (Master Record) 5 ปี</td>
                            <td className="p-2 text-slate-700 font-semibold">DCC / เจ้าหน้าที่บันทึก</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Document Footer Signatures */}
                  <div className="pt-4 border-t-2 border-slate-900 grid grid-cols-3 gap-4 text-center text-xs">
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <span className="font-bold text-slate-600 block text-[10px]">ผู้จัดทำ (Prepared By)</span>
                      <div className="h-10 flex items-center justify-center font-serif text-slate-800 italic">
                        {currentUser.position || `เจ้าหน้าที่ ${doc.dept || currentUser.currentDept}`}
                      </div>
                      <span className="text-[10px] text-slate-500 border-t border-slate-200 block pt-1">
                        หน่วยงาน: {doc.dept || currentUser.currentDept}
                      </span>
                    </div>
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <span className="font-bold text-slate-600 block text-[10px]">ผู้ทบทวน (Reviewed By)</span>
                      <div className="h-10 flex items-center justify-center font-serif text-slate-800 italic">
                        ผู้ควบคุมเอกสาร (DCC Controller)
                      </div>
                      <span className="text-[10px] text-slate-500 border-t border-slate-200 block pt-1">
                        DCC Admin / ISO Controller
                      </span>
                    </div>
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <span className="font-bold text-slate-600 block text-[10px]">ผู้อนุมัติ (Approved By)</span>
                      <div className="h-10 flex items-center justify-center font-serif text-slate-800 italic">
                        ตัวแทนฝ่ายบริหาร (QMR / Dept Head)
                      </div>
                      <span className="text-[10px] text-slate-500 border-t border-slate-200 block pt-1">
                        ตัวแทนฝ่ายบริหารด้านคุณภาพ (QMR)
                      </span>
                    </div>
                  </div>

                </div>

            </div>
          )}

          {/* TAB 2: FILE ATTACHMENT DETAILS */}
          {activeTab === 'file-info' && (
            <div className="max-w-3xl mx-auto space-y-4">
              
              {/* File Status Card */}
              <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      {isPdf ? <FileText className="w-6 h-6 text-rose-600" /> : isImage ? <Eye className="w-6 h-6 text-cyan-600" /> : <FileBox className="w-6 h-6 text-indigo-600" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {doc.fileName || `${doc.docNo || 'Document'}_Rev${doc.revision || '00'}`}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {doc.fileDataUrl ? 'ไฟล์แนบถูกจัดเก็บในระบบเรียบร้อยแล้ว พร้อมให้ DCC หรือผู้เกี่ยวข้องดาวน์โหลด' : 'เอกสารสร้างขึ้นในระบบ DCS'}
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    doc.fileDataUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {doc.fileDataUrl ? '✓ มีไฟล์แนบจริง' : 'โครงสร้างเอกสาร DCS'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">ชื่อไฟล์</span>
                    <span className="font-bold text-slate-800 font-mono break-all">{doc.fileName || 'ระบบ DCS Document'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">ขนาดไฟล์</span>
                    <span className="font-bold text-slate-800">{doc.fileSize || 'N/A'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">ประเภทไฟล์</span>
                    <span className="font-bold text-slate-800 font-mono">{doc.fileType || (isPdf ? 'application/pdf' : 'Quality Document')}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">สถานะการจัดเก็บ</span>
                    <span className="font-bold text-emerald-700">จัดเก็บถาวรในระบบ DCS</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดไฟล์นี้
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: PROPERTIES & METADATA */}
          {activeTab === 'properties' && (
            <div className="max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h4 className="font-bold text-slate-900 text-sm border-b pb-2 border-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                คุณสมบัติและประวัติเอกสาร (Document Properties)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">รหัสเอกสาร (Doc No.)</span>
                  <span className="font-mono font-bold text-indigo-950 block text-sm">{doc.docNo || 'N/A'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">ครั้งที่แก้ไข (Revision)</span>
                  <span className="font-mono font-bold text-rose-700 block text-sm">Rev.{doc.revision || '00'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">ประเภทเอกสาร (Type)</span>
                  <span className="font-bold text-slate-800 block text-sm">{doc.docType || 'Quality Document'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">หน่วยงานผู้รับผิดชอบ (Department)</span>
                  <span className="font-bold text-slate-800 block text-sm">{doc.dept || 'DCC'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 sm:col-span-2">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">ชื่อเอกสารภาษาไทย</span>
                  <span className="font-bold text-slate-800 block">{doc.docNameTh || doc.title}</span>
                </div>

                {doc.docNameEn && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 sm:col-span-2">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">ชื่อเอกสารภาษาอังกฤษ</span>
                    <span className="text-slate-700 italic block">{doc.docNameEn}</span>
                  </div>
                )}

                {doc.darId && (
                  <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-1 sm:col-span-2">
                    <span className="text-[10px] text-indigo-600 font-semibold uppercase">อ้างอิงใบคำขอ DAR (DAR Reference)</span>
                    <span className="font-mono font-bold text-indigo-900 block">{doc.darId}</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>ระบบแสดงตัวอย่างและดาวน์โหลดไฟล์เอกสารควบคุมคุณภาพ DCS</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              ดาวน์โหลดไฟล์
            </button>
            <button
              onClick={handleClose}
              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
