import React, { useState, useEffect } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  Download,
  Lock,
  X,
  CheckCircle2,
  AlertTriangle,
  PenTool,
  Clock,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { downloadStorageFileBlob, getStorageFileUrl } from '../services/dcsRepository';

export const DownloadModal: React.FC = () => {
  const {
    selectedDistributionForDownload,
    setSelectedDistributionForDownload,
    downloadControlledCopy,
    currentUser,
  } = useDcs();

  if (!selectedDistributionForDownload) return null;

  const { distribution, dept } = selectedDistributionForDownload;

  const target = distribution.targets.find(t => t.dept === dept);

  const [downloaderName] = useState(currentUser.currentDept === dept ? currentUser.userName : '');
  const [downloaderEmpId] = useState(currentUser.currentDept === dept ? currentUser.userEmpId : '');
  const [downloaderPosition] = useState(currentUser.currentDept === dept ? currentUser.position : '');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [isLoadingSignature, setIsLoadingSignature] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitPercent, setSubmitPercent] = useState(0);
  const [readyDownloads, setReadyDownloads] = useState<Array<{ url: string; name: string }>>([]);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  // Calculate remaining time
  const expiryTime = new Date(distribution.expirationDate).getTime();
  const now = new Date().getTime();
  const diffMs = expiryTime - now;
  const isExpired = diffMs <= 0;

  const hoursRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const remHours = hoursRemaining % 24;

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDistributionForDownload(null);
      }
    };
    if (selectedDistributionForDownload) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDistributionForDownload, setSelectedDistributionForDownload]);

  const handleClose = () => {
    readyDownloads.forEach(file => URL.revokeObjectURL(file.url));
    setSelectedDistributionForDownload(null);
  };

  useEffect(() => {
    let active = true;
    setIsLoadingSignature(true);
    if (!currentUser.signaturePath) {
      setErrorMsg('บัญชีนี้ยังไม่มีลายเซ็นที่อนุมัติ กรุณาติดต่อ DCC');
      setIsLoadingSignature(false);
      return () => { active = false; };
    }
    void getStorageFileUrl(currentUser.signaturePath)
      .then(url => { if (active) setSignatureData(url); })
      .catch(() => { if (active) setErrorMsg('โหลดลายเซ็นที่ลงทะเบียนไม่ได้ กรุณาเข้าสู่ระบบใหม่หรือติดต่อ DCC'); })
      .finally(() => { if (active) setIsLoadingSignature(false); });
    return () => { active = false; };
  }, [currentUser.signaturePath]);

  useEffect(() => {
    const receipt = distribution.receipts?.[dept];
    if (!target?.isDownloaded || receipt?.downloaderUid !== currentUser.uid || isExpired) return;
    const paths = distribution.departmentFileLists?.[dept]
      || (distribution.departmentFiles?.[dept] ? [distribution.departmentFiles[dept]] : []);
    if (!paths.length) return;
    let active = true;
    setSubmitStatus('กำลังเตรียมลิงก์ดาวน์โหลดเดิม');
    void Promise.all(paths.map(path => getStorageFileUrl(path)))
      .then(urls => {
        if (!active) return;
        setReadyDownloads(urls.map((url, index) => {
          const baseName = distribution.fileNames?.[index] || distribution.fileName || `${distribution.docNo}_${index + 1}.pdf`;
          return { url, name: `CONTROLLED_${dept}_${baseName}` };
        }));
      })
      .catch(() => { if (active) setErrorMsg('ไม่สามารถเปิดไฟล์ที่รับไว้แล้ว กรุณาติดต่อ DCC'); });
    return () => { active = false; };
  }, [currentUser.uid, dept, distribution, isExpired, target?.isDownloaded]);

  const handleConfirmDownload = async () => {
    setErrorMsg('');

    if (isExpired) {
      setErrorMsg('ลิงก์ดาวน์โหลดหมดอายุแล้ว (เกิน 3 วัน) ไม่สามารถดำเนินการได้ กรุณาร้องขอ DCC');
      return;
    }

    if (!downloaderName.trim()) {
      setErrorMsg('กรุณาระบุชื่อ-นามสกุล ผู้ดาวน์โหลด');
      return;
    }

    if (!signatureData) {
      setErrorMsg('กรุณาลงลายมือชื่อดิจิทัล หรือแนบไฟล์รูปลายเซ็น เพื่อเป็นหลักฐานตามมาตรฐาน ISO');
      return;
    }

    if (!agreeTerms) {
      setErrorMsg('กรุณาทำเครื่องหมายยินยอมเงื่อนไขการจัดเก็บ Controlled Copy');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('กำลังตรวจสอบสิทธิ์รับเอกสาร');
    setSubmitPercent(2);

    const result = await downloadControlledCopy(
      distribution.id,
      dept,
      downloaderName.trim(),
      downloaderEmpId.trim(),
      downloaderPosition.trim(),
      signatureData,
      (message, percent) => {
        setSubmitStatus(message);
        setSubmitPercent(percent);
      }
    );

    if (result.success) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      const urls = result.downloadUrls?.length ? result.downloadUrls : (result.downloadUrl ? [result.downloadUrl] : []);
      if (!urls.length) {
        setIsSubmitting(false);
        setErrorMsg('บันทึกการรับสำเร็จ แต่ไม่พบไฟล์ดาวน์โหลด กรุณาติดต่อ DCC');
        return;
      }
      setReadyDownloads(urls.map((url, index) => {
        const baseName = distribution.fileNames?.[index] || distribution.fileName || `${distribution.docNo}_Rev${distribution.revision}_CONTROLLED_${index + 1}.pdf`;
        return { url, name: `CONTROLLED_${dept}_${baseName}` };
      }));
      setSubmitStatus('บันทึกการรับสำเร็จ กรุณากดดาวน์โหลดไฟล์ทีละรายการ');
      setSubmitPercent(100);
      setIsSubmitting(false);
    } else {
      setIsSubmitting(false);
      setErrorMsg(result.message);
    }
  };

  const getReadyStoragePaths = () =>
    distribution.departmentFileLists?.[dept]
      || (distribution.departmentFiles?.[dept] ? [distribution.departmentFiles[dept]] : []);

  const saveBlobToDevice = (blob: Blob, name: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  };

  const downloadReadyFile = async (file: { url: string; name: string }, index: number) => {
    setErrorMsg('');
    setDownloadingIndex(index);
    try {
      const paths = getReadyStoragePaths();
      if (!paths[index]) throw new Error('ไม่พบตำแหน่งไฟล์');
      const blob = await downloadStorageFileBlob(paths[index]);
      saveBlobToDevice(blob, file.name);
    } catch {
      setErrorMsg(`ดาวน์โหลดไฟล์ที่ ${index + 1} ไม่สำเร็จ กรุณากดใหม่อีกครั้ง`);
    } finally {
      setDownloadingIndex(null);
    }
  };

  const downloadAllReadyFiles = async () => {
    if (!readyDownloads.length || isDownloadingAll) return;
    setErrorMsg('');
    setIsDownloadingAll(true);
    try {
      const paths = getReadyStoragePaths();
      if (paths.length !== readyDownloads.length) throw new Error('จำนวนไฟล์ไม่ตรงกัน');
      // Download the real PDF bytes through the Firebase SDK, then save each Blob.
      // No new browser tabs are opened.
      for (let index = 0; index < readyDownloads.length; index += 1) {
        setDownloadingIndex(index);
        const blob = await downloadStorageFileBlob(paths[index]);
        saveBlobToDevice(blob, readyDownloads[index].name);
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
    } catch {
      setErrorMsg('ดาวน์โหลดไฟล์ทั้งหมดไม่สำเร็จ กรุณาลองใหม่ หรือกดดาวน์โหลดทีละไฟล์');
    } finally {
      setDownloadingIndex(null);
      setIsDownloadingAll(false);
    }
  };

  return (
    <div
      id="download-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
                <Download className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  ดาวน์โหลด Controlled Copy (สำเนาควบคุม)
                </h3>
                <p className="text-[11px] text-slate-300">
                  ระบบบันทึกหลักฐานและล็อคสิทธิ์ดาวน์โหลด 1 แผนก = 1 ครั้ง
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-download-modal-header"
            onClick={handleClose}
            aria-label="ปิดหน้าต่าง"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-slate-800 text-xs">
          
          {/* Expiration Timer Banner */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            isExpired 
              ? 'bg-rose-50 border-rose-200 text-rose-800' 
              : hoursRemaining < 24 
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold">
                  {isExpired ? '🔴 ลิงก์ดาวน์โหลดหมดอายุแล้ว' : '🟢 อายุสิทธิ์ดาวน์โหลด (3 วัน)'}
                </span>
                <p className="text-[10px]">
                  {isExpired 
                    ? 'เกินกำหนด 72 ชม. นับจากวันที่แจกจ่าย' 
                    : `เหลือเวลาอีก: ${daysRemaining} วัน ${remHours} ชั่วโมง (หมดอายุ: ${new Date(distribution.expirationDate).toLocaleString('th-TH')})`}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border">
              {distribution.distributionNo}
            </span>
          </div>

          {/* Document Summary Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-indigo-700">{distribution.docNo}</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded-md">
                Revision: Rev.{distribution.revision}
              </span>
            </div>
            <p className="font-bold text-slate-900 text-xs">{distribution.docNameTh}</p>
            <p className="text-[11px] text-slate-500 italic">{distribution.docNameEn}</p>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
              <div>
                <span className="text-slate-400">หน่วยงานผู้รับ: </span>
                <span className="font-bold text-slate-800">{dept}</span>
              </div>
              <div>
                <span className="text-slate-400">โควตาสำเนา: </span>
                <span className="font-bold text-emerald-700">Copy 1/1 (สิทธิ์เดียว)</span>
              </div>
            </div>
          </div>

          {/* Already Downloaded Warning Check */}
          {target?.isDownloaded ? (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>🔒 หน่วยงาน {dept} ได้ใช้สิทธิ์ดาวน์โหลดไปแล้ว</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                ผู้ดาวน์โหลด: <strong>{target.downloaderName}</strong> ({target.downloaderEmpId || 'ไม่ระบุรหัส'})
                <br />
                เมื่อวันที่: <strong>{new Date(target.downloadTimestamp!).toLocaleString('th-TH')}</strong>
                <br />
                หากไฟล์สูญหายหรือต้องการสำเนาเพิ่มเติม โปรดส่งคำร้องขอผ่านระบบถึง DCC
              </p>
            </div>
          ) : (
            /* Downloader Form & Signature */
            <div className="space-y-4">
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    1. ข้อมูลผู้รับมอบหมายและดาวน์โหลดเอกสาร
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ดึงจากบัญชีที่เข้าสู่ระบบอัตโนมัติ
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ชื่อ-นามสกุล ผู้รับเอกสาร
                    </label>
                    <input
                      type="text"
                      value={downloaderName}
                      readOnly
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-100 rounded-xl text-sm font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      รหัสพนักงาน (Employee ID) <span className="text-slate-400 font-normal">(ถ้ามี)</span>
                    </label>
                    <input
                      type="text"
                      value={downloaderEmpId}
                      readOnly
                      className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ตำแหน่ง / หน้าที่ (Position / Role)
                  </label>
                  <input
                    type="text"
                    value={downloaderPosition}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Signature Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <PenTool className="w-4 h-4 text-indigo-600" />
                    2. ลายมือชื่ออิเล็กทรอนิกส์ (Digital Signature) <span className="text-rose-500">*</span>
                  </h4>
                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">เซ็นด่วนจากบัญชี</span>
                </div>

                <div className="border-2 border-emerald-200 rounded-xl p-3 bg-emerald-50/40 text-center">
                  {isLoadingSignature ? (
                    <span className="text-xs text-slate-500">กำลังโหลดลายเซ็นที่ลงทะเบียน...</span>
                  ) : signatureData ? (
                    <div className="space-y-1">
                      <img src={signatureData} alt="ลายเซ็นที่ลงทะเบียน" className="h-20 max-w-full mx-auto object-contain bg-white rounded border p-1" />
                      <p className="text-[10px] text-emerald-700 font-semibold">ระบบจะบันทึกลายเซ็นนี้เป็นหลักฐานรับเอกสาร</p>
                    </div>
                  ) : (
                    <span className="text-xs text-rose-600">ไม่พบลายเซ็นที่ลงทะเบียน</span>
                  )}
                </div>
              </div>

              {/* Acknowledgement Checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={e => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs">
                      ข้าพเจ้ายืนยันรับ Controlled Copy (Copy 1/1)
                    </span>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      จะนำไฟล์ไปจัดเก็บไว้ในเครื่องคอมพิวเตอร์ประจำหน่วยงาน ({dept}) และไม่ทำสำเนาแจกจ่ายต่อโดยไม่ได้รับอนุญาตจาก DCC ตามข้อกำหนด ISO 9001:2015 Clause 7.5
                    </p>
                  </div>
                </label>
              </div>

            </div>
          )}

          {isSubmitting && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                <span>{submitStatus || 'กำลังดำเนินการ...'}</span>
                <span>{submitPercent}%</span>
              </div>
              <div className="h-2.5 bg-indigo-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${submitPercent}%` }} />
              </div>
              <p className="text-[10px] text-indigo-700">กรุณาอย่าปิดหน้าต่าง ระยะเวลาขึ้นอยู่กับจำนวนและขนาดไฟล์ PDF</p>
            </div>
          )}

          {readyDownloads.length > 0 && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                บันทึกการรับเอกสารสำเร็จ — กดดาวน์โหลดไฟล์ด้านล่าง
              </div>
              <p className="text-[11px] text-emerald-800">ไฟล์พร้อมดาวน์โหลดแล้ว สามารถดาวน์โหลดทั้งหมดในครั้งเดียว หรือเลือกดาวน์โหลดทีละไฟล์ได้</p>
              {readyDownloads.length > 1 && (
                <button
                  type="button"
                  id="btn-download-all-controlled-files"
                  onClick={() => void downloadAllReadyFiles()}
                  disabled={isDownloadingAll || downloadingIndex !== null}
                  className="w-full px-4 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {isDownloadingAll ? `กำลังดาวน์โหลด ${readyDownloads.length} ไฟล์...` : `ดาวน์โหลดไฟล์ทั้งหมด (${readyDownloads.length} ไฟล์)`}
                </button>
              )}
              <div className="space-y-2">
                {readyDownloads.map((file, index) => (
                  <button
                    type="button"
                    key={file.url}
                    onClick={() => downloadReadyFile(file, index)}
                    disabled={downloadingIndex !== null || isDownloadingAll}
                    className="w-full px-4 py-3 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-between gap-3"
                  >
                    <span className="truncate">{downloadingIndex === index ? 'กำลังดาวน์โหลด...' : `ไฟล์ที่ ${index + 1}: ${file.name}`}</span>
                    <Download className="w-4 h-4 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <HardDrive className="w-3.5 h-3.5" />
            <span>จัดเก็บ Copy 1/1 ลงเครื่องประจำแผนก</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-close-download-modal-footer"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              {target?.isDownloaded || isExpired ? 'ปิดหน้าต่าง' : 'ยกเลิก / ปิด'}
            </button>

            {!target?.isDownloaded && readyDownloads.length === 0 && (
              <button
                type="button"
                id="btn-confirm-download-controlled"
                disabled={isSubmitting || isExpired || isLoadingSignature || !signatureData}
                onClick={handleConfirmDownload}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {isSubmitting ? (submitStatus || 'กำลังดำเนินการ...') : 'ยินยอม รับเอกสาร และเตรียมดาวน์โหลด'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
