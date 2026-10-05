import React from 'react';
import { DarAdditionalDocument, DarRequestType, Department, DocumentType, DEPARTMENTS } from '../types';
import { NanoLogo } from './NanoLogo';

interface DarLivePreviewProps {
  requestType: DarRequestType;
  requestDept: Department;
  requesterName: string;
  targetEffectiveDate: string;
  docNo: string;
  docNameTh: string;
  docNameEn: string;
  docType: DocumentType;
  currentRevision: string;
  proposedRevision: string;
  reasonForChange: string;
  additionalDocuments: DarAdditionalDocument[];
  requesterSignature?: string;
  approverName: string;
  approverDate: string;
  approverSignature?: string;
  distributionHolders: { checked: boolean; dept: Department; position: string; copies: string }[];
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const Mark: React.FC<{ checked: boolean; round?: boolean }> = ({ checked, round }) => (
  <span className={`inline-flex w-3 h-3 border border-black items-center justify-center text-[8px] font-black ${round ? 'rounded-full' : ''}`}>
    {checked ? (round ? '●' : '✓') : ''}
  </span>
);

export const DarLivePreview: React.FC<DarLivePreviewProps> = props => {
  const rows = [
    {
      docNo: props.docNo,
      docNameTh: props.docNameTh,
      docNameEn: props.docNameEn,
      previousEffectiveDate: props.requestType === 'NEW' ? '' : new Date().toISOString().split('T')[0],
      revision: props.requestType === 'OBSOLETE' ? 'OBSOLETE' : props.proposedRevision,
      reason: props.reasonForChange,
    },
    ...props.additionalDocuments,
  ].slice(0, 6);
  while (rows.length < 6) rows.push({ docNo: '', docNameTh: '', docNameEn: '', previousEffectiveDate: '', revision: '', reason: '' });

  const holders = props.distributionHolders.filter(item => item.checked).slice(0, 14);
  const deptName = (dept: Department) => DEPARTMENTS.find(item => item.id === dept)?.nameTh || dept;
  const type = String(props.docType);
  const reviewItems = ['QP', 'WI'];

  return (
    <div className="relative bg-white text-black shadow-xl border border-slate-300 rounded-lg p-5 w-full aspect-[210/297] overflow-hidden font-sans text-[8px] leading-tight">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <span className="-rotate-45 text-rose-100 text-5xl font-black whitespace-nowrap">DRAFT / ฉบับร่าง</span>
      </div>

      <div className="relative z-10 h-full flex flex-col">
        <div className="grid grid-cols-[72px_1fr_72px] items-center mb-2">
          <NanoLogo className="h-8 w-16" />
          <div className="text-center text-[12px] font-black">ใบขอดำเนินการจัดการด้านเอกสาร (DAR.)</div>
          <div />
        </div>

        <div className="space-y-1.5 mb-2">
          <div className="flex gap-2 items-start">
            <b className="w-20 shrink-0">ประเภทเอกสาร</b>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 flex-1">
              {[
                ['QM', 'คู่มือคุณภาพ (QM)'], ['QP', 'ระเบียบปฏิบัติ (QP)'], ['WI', 'วิธีการทำงาน (WI)'],
                ['FM', 'แบบฟอร์ม (FM)'], ['SD', 'เอกสารสนับสนุน (SD)'], ['DRAWING', 'DRAWING / แบบ'],
                ['EX', 'เอกสารภายนอก (EX)'], ['OTHER', 'อื่น ๆ'],
              ].map(([value, label]) => <span key={value} className="flex items-center gap-1"><Mark checked={type === value || (value === 'OTHER' && !['QM','QP','WI','FM','SD','DRAWING','EX'].includes(type))} />{label}</span>)}
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <b className="w-20 shrink-0">มีความประสงค์</b>
            <div className="grid grid-cols-4 gap-2 flex-1">
              <span className="flex gap-1 items-center"><Mark round checked={props.requestType === 'NEW'} />ขอจัดทำใหม่</span>
              <span className="flex gap-1 items-center"><Mark round checked={props.requestType === 'REVISION'} />ขอแก้ไข</span>
              <span className="flex gap-1 items-center"><Mark round checked={props.requestType === 'OBSOLETE'} />ยกเลิก</span>
              <span className="flex gap-1 items-center"><Mark round checked={false} />อื่น ๆ ______</span>
            </div>
          </div>
        </div>

        <b className="mb-1">ตามรายการดังต่อไปนี้</b>
        <table className="w-full border-collapse border border-black table-fixed mb-1.5">
          <thead><tr className="text-center font-bold">
            <th className="border border-black w-[6%] p-1">ลำดับ</th><th className="border border-black w-[18%] p-1">หมายเลข</th>
            <th className="border border-black w-[27%] p-1">ชื่อเอกสาร</th><th className="border border-black w-[17%] p-1">วันที่เอกสารเดิม<br/>บังคับใช้</th>
            <th className="border border-black w-[10%] p-1">ฉบับที่</th><th className="border border-black w-[22%] p-1">เหตุผล</th>
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="h-8 align-middle">
            <td className="border border-black text-center">{index + 1}</td>
            <td className="border border-black px-1 font-mono font-bold break-words">{row.docNo}</td>
            <td className="border border-black px-1 break-words"><b>{row.docNameTh}</b>{row.docNameEn && <div className="italic text-[7px]">{row.docNameEn}</div>}</td>
            <td className="border border-black text-center">{index === 0 && props.requestType === 'NEW' ? '-' : formatDate(row.previousEffectiveDate)}</td>
            <td className="border border-black text-center font-bold">{row.revision}</td>
            <td className="border border-black px-1 break-words">{row.reason}</td>
          </tr>)}</tbody>
        </table>

        <div className="flex gap-3 items-center mb-2"><b>ที่ต้องทบทวน</b>{['QP','PQCT','SD','WI','FMEA','BOM'].map(item => <span key={item} className="flex gap-1 items-center"><Mark checked={reviewItems.includes(item)} />{item}</span>)}</div>

        <div className="border-t border-black pt-1">
          <b className="text-[9px]">รายละเอียดการแจก-จ่าย</b>
          <div className="flex justify-between mt-1 mb-1">
            <span>โดยเอกสารฉบับใหม่ มีวันที่บังคับใช้: <u className="font-bold">{formatDate(props.targetEffectiveDate) || '__________'}</u></span>
            <span>ฉบับที่: <u className="font-bold">{props.proposedRevision || '____'}</u></span>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 min-h-[86px]">
            {Array.from({ length: 14 }, (_, index) => {
              const item = holders[index];
              return <div key={index} className="flex items-center gap-1"><Mark checked={Boolean(item)} /><span className="border-b border-black flex-1 truncate">{item ? deptName(item.dept) : ''}</span><span>จำนวนชุด</span><span className="border-b border-black w-5 text-center">{item?.copies || ''}</span><span>ชุด</span></div>;
            })}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-[1fr_150px] gap-4 text-center">
          <div className="border border-black">
            <div className="border-b border-black py-1 text-left px-2">แผนกที่ขอดำเนินการ: <b>{deptName(props.requestDept)}</b></div>
            <div className="grid grid-cols-2">
              <div className="border-r border-black min-h-[68px] flex flex-col items-center justify-between p-1"><b>ผู้ขอดำเนินการ</b>{props.requesterSignature ? <img src={props.requesterSignature} alt="ลายเซ็นผู้ยื่นคำขอ" className="max-h-10 max-w-full object-contain"/> : <span/>}<span>{props.requesterName || '________________'}</span></div>
              <div className="min-h-[68px] flex flex-col items-center justify-between p-1"><b>ผู้อนุมัติ</b>{props.approverSignature ? <img src={props.approverSignature} alt="ลายเซ็นผู้อนุมัติ" className="max-h-10 max-w-full object-contain"/> : <span/>}<span>{props.approverName || '________________'} {formatDate(props.approverDate)}</span></div>
            </div>
          </div>
          <div className="border border-black flex flex-col"><b className="border-b border-black py-1">QMR.</b><div className="p-1 text-left"><Mark checked={false}/> YES &nbsp; <Mark checked={false}/> NO</div><div className="flex-1"/><div className="border-t border-black py-1">____/____/____</div></div>
        </div>
      </div>
    </div>
  );
};
