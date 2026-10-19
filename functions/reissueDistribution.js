// Reopen selected recipients in the original distribution, preserving first receipts.
const DAY_MS = 86400000;
const canonical = dept => ['QA', 'QC', 'QA/QC'].includes(dept) ? 'QA/QC' : dept;
const signed = receipt => Boolean(receipt?.downloadedAt && receipt?.signatureStoragePath);
const earliestReceipt = receipts => receipts.filter(signed).sort((a, b) =>
  (Date.parse(a.downloadedAt) - Date.parse(b.downloadedAt)) || a.downloadedAt.localeCompare(b.downloadedAt))[0];

function buildReopenPatch(data, departments, prepared, allocation, now, operationId, uid, stampVersion) {
  const firstReceipts = { ...(data.firstReceipts || {}) };
  const receipts = { ...(data.receipts || {}) };
  const targets = [...(data.targets || [])];
  const targetDepartments = [...(data.targetDepartments || [])];
  const patch = { firstReceipts, receipts, targets, targetDepartments };
  for (const field of ['allocationByDepartment', 'departmentExpirationEpoch', 'departmentFiles', 'departmentFileLists', 'departmentFileKeys', 'departmentFileKeyLists', 'departmentFileNames', 'departmentSourceStoragePaths', 'controlledStampVersions', 'departmentCancellations']) {
    patch[field] = { ...(data[field] || {}) };
  }
  const previousReceipts = {};
  for (const department of departments) {
    const aliases = [...new Set([department, ...Object.keys(receipts), ...Object.keys(firstReceipts), ...targetDepartments])].filter(dept => canonical(dept) === department);
    const first = earliestReceipt(aliases.flatMap(dept => [firstReceipts[dept], receipts[dept]]));
    if (first) firstReceipts[department] = { ...first, dept: department };
    for (const alias of aliases) {
      if (receipts[alias]) previousReceipts[alias] = receipts[alias];
      delete receipts[alias];
      delete patch.departmentCancellations[alias];
      if (alias !== department) {
        delete firstReceipts[alias];
        const index = targetDepartments.indexOf(alias);
        if (index >= 0) targetDepartments.splice(index, 1);
      }
    }
    if (!targetDepartments.includes(department)) targetDepartments.push(department);
    const copies = Math.max(1, Number(aliases.map(dept => data.allocationByDepartment?.[dept]).find(Boolean) || allocation[department] || 1));
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      if (canonical(targets[index].dept) === department) targets.splice(index, 1);
    }
    targets.push({ dept: department, allocatedCopies: copies, copyNo: `${copies} สำเนา`, isDownloaded: false, downloadTimestamp: null, downloaderName: null, downloaderEmpId: null, downloaderPosition: null, signatureDataUrl: null, status: 'PENDING' });
    patch.allocationByDepartment[department] = copies;
    patch.departmentExpirationEpoch[department] = now + 3 * DAY_MS;
    patch.departmentFiles[department] = prepared[department].paths[0];
    patch.departmentFileLists[department] = prepared[department].paths;
    patch.departmentFileKeys[department] = prepared[department].departmentKey;
    patch.departmentFileKeyLists[department] = prepared[department].keys;
    patch.departmentFileNames[department] = prepared[department].names;
    patch.departmentSourceStoragePaths[department] = prepared[department].sourcePaths;
    patch.controlledStampVersions[department] = stampVersion;
  }
  // Materialize old per-department deadlines before extending the global purge deadline.
  for (const dept of targetDepartments) {
    if (!patch.departmentExpirationEpoch[dept]) patch.departmentExpirationEpoch[dept] = Number(data.expirationEpoch || now);
  }
  const expirationEpoch = Math.max(...Object.values(patch.departmentExpirationEpoch).map(Number));
  Object.assign(patch, {
    status: 'IN_PROGRESS', storageStatus: 'AVAILABLE', stampStatus: 'COMPLETED',
    allDownloadedAt: null, fileDeletedAt: null, expirationEpoch,
    expirationDate: new Date(expirationEpoch).toISOString(), expirationAt: new Date(expirationEpoch),
    reissueLock: null, reissueProgress: { operationId, percent: 100, detail: 'เปิดสิทธิ์รับเอกสารในชุดเดิมสำเร็จ' },
    copyReissueHistory: [...(data.copyReissueHistory || []), ...departments.map(department => ({ requestId: operationId, department, approvedAt: new Date(now).toISOString(), approvedBy: uid, fileCount: prepared[department].paths.length }))],
    updatedAt: new Date(now).toISOString(),
  });
  return { patch, previousReceipts };
}

function createReissueHandler({ getFirestore, getStorage, requireDcc, HttpsError, loadPdf, savePdf, controlledStamp, stampVersion, safeSegment, validDepartments, notify }) {
  return async request => {
    await requireDcc(request);
    const input = request.data || {};
    const distributionId = String(input.distributionId || '').trim();
    const requestId = String(input.requestId || '').trim();
    const operationId = requestId ? `request-${requestId}` : String(input.operationId || '');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(distributionId) || !/^[A-Za-z0-9_-]{1,120}$/.test(operationId)) throw new HttpsError('invalid-argument', 'ข้อมูลการเปิดสิทธิ์ไม่ครบ');
    const db = getFirestore();
    const distRef = db.collection('dcs_distributions').doc(distributionId);
    const operationRef = db.collection('dcs_distribution_operations').doc(`${distributionId}_${operationId}`);
    const requestRef = requestId ? db.collection('dcs_copy_requests').doc(requestId) : null;
    const uploaded = input.sourceFiles || [];
    if (!Array.isArray(uploaded) || uploaded.length > 20 || uploaded.some(file =>
      typeof file.path !== 'string' || !file.path.startsWith(`dcs/distributions/${distributionId}/source/${operationId}-`) || file.path.split('/').length !== 5 || !/\.pdf$/i.test(file.path) || typeof file.name !== 'string' || !/\.pdf$/i.test(file.name))) {
      throw new HttpsError('invalid-argument', 'ไฟล์ PDF ต้องอยู่ในชุดแจกจ่ายนี้');
    }
    const initial = await db.runTransaction(async tx => {
      const [snapshot, operation, copySnapshot] = await Promise.all([tx.get(distRef), tx.get(operationRef), requestRef ? tx.get(requestRef) : null]);
      if (operation.data()?.status === 'COMPLETED') return { done: operation.data().result };
      if (!snapshot.exists) throw new HttpsError('not-found', 'ไม่พบใบแจกจ่าย');
      const data = snapshot.data();
      if (data.status === 'CANCELLED') throw new HttpsError('failed-precondition', 'ใบแจกจ่ายนี้ถูกยกเลิกแล้ว');
      if (data.stampStatus === 'PROCESSING' || data.reissueLock?.expiresAt > Date.now()) throw new HttpsError('aborted', 'ชุดนี้กำลังดำเนินการ กรุณารอแล้วลองใหม่');
      const copyRequest = copySnapshot?.data();
      if (requestRef && (!copySnapshot?.exists || copyRequest.distributionId !== distributionId || copyRequest.status !== 'PROCESSING')) throw new HttpsError('failed-precondition', 'สถานะคำขอสำเนาใหม่ไม่ถูกต้อง');
      const requested = requestRef ? [copyRequest.dept] : input.departments;
      if (!Array.isArray(requested) || !requested.length || requested.some(dept => !validDepartments.has(canonical(dept)))) throw new HttpsError('invalid-argument', 'กรุณาเลือกหน่วยงานผู้รับ');
      const departments = [...new Set(requested.map(canonical))];
      if (requestRef && !data.targetDepartments?.some(dept => canonical(dept) === departments[0])) throw new HttpsError('failed-precondition', 'แผนกผู้ขอไม่ได้อยู่ในชุดแจกจ่ายนี้');
      tx.update(distRef, { reissueLock: { id: operationId, expiresAt: Date.now() + 12 * 60000 }, reissueProgress: { operationId, percent: 5, detail: 'กำลังตรวจสอบไฟล์สำหรับแผนกที่เลือก' } });
      tx.set(operationRef, { status: 'PROCESSING', distributionId, departments, startedBy: request.auth.uid, startedAt: new Date().toISOString() });
      return { data, departments, copyRequest };
    });
    if (initial.done) return initial.done;
    const { data, departments, copyRequest } = initial;
    const generatedPaths = [];
    let committed = false;
    try {
      const masterRef = db.collection('dcs_documents').doc(data.docId);
      const masterSnapshot = await masterRef.get();
      const master = masterSnapshot.data();
      if (!masterSnapshot.exists || master.status !== 'ACTIVE' || master.currentRevision !== data.revision || master.darReferenceId !== data.darReferenceId) throw new HttpsError('failed-precondition', 'ต้องเป็น DAR และ Revision ที่ใช้งานอยู่ใน Master List');
      const sourcePaths = uploaded.length ? uploaded.map(file => file.path)
        : (master.currentFileStoragePaths?.length ? master.currentFileStoragePaths : [master.currentFileStoragePath].filter(Boolean));
      const names = uploaded.length ? uploaded.map(file => file.name) : (data.fileNames?.length ? data.fileNames : [data.fileName || 'document.pdf']);
      const bucket = getStorage().bucket();
      // Archive replacement sources outside the expiring delivery folder.
      // A future reopening must restore the same set, not an older master attachment.
      const archivedUploads = [];
      for (let i = 0; i < uploaded.length; i += 1) {
        const [metadata] = await bucket.file(uploaded[i].path).getMetadata();
        if (Number(metadata.size) > 25 * 1024 * 1024) throw new HttpsError('invalid-argument', 'PDF แต่ละไฟล์ต้องไม่เกิน 25 MB');
        const archivePath = `dcs/archive/${safeSegment(data.docId)}/distributions/${distributionId}/${operationId}/${i + 1}-${safeSegment(uploaded[i].name)}`;
        generatedPaths.push(archivePath);
        await bucket.file(uploaded[i].path).copy(bucket.file(archivePath));
        archivedUploads.push(archivePath);
      }
      const prepared = {};
      for (let d = 0; d < departments.length; d += 1) {
        const department = departments[d];
        const existing = data.departmentFileLists?.[department] || (data.departmentFiles?.[department] ? [data.departmentFiles[department]] : []);
        const available = await Promise.all(existing.map(path => bucket.file(path).exists()));
        let paths = existing;
        const departmentSources = uploaded.length ? archivedUploads : (data.departmentSourceStoragePaths?.[department]?.length ? data.departmentSourceStoragePaths[department] : sourcePaths);
        let fileNames = uploaded.length ? names : (data.departmentFileNames?.[department] || names);
        if (uploaded.length || !existing.length || available.some(([exists]) => !exists) || data.controlledStampVersions?.[department] !== stampVersion) {
          if (!departmentSources.length) throw new HttpsError('failed-precondition', 'ไฟล์เดิมไม่อยู่แล้ว กรุณาแนบ PDF ในหน้าต่างแจกจ่าย');
          paths = [];
          for (let i = 0; i < departmentSources.length; i += 1) {
            const pdf = await loadPdf(departmentSources[i]);
            await controlledStamp(pdf, department);
            const filename = `${operationId}-${String(i + 1).padStart(2, '0')}-${safeSegment(fileNames[i] || `document-${i + 1}.pdf`)}`;
            const path = `dcs/distributions/${distributionId}/controlled/${safeSegment(department)}/${filename}`;
            generatedPaths.push(path);
            await savePdf(pdf, path);
            paths.push(path);
            const progress = { operationId, percent: 10 + Math.round(((d + (i + 1) / departmentSources.length) / departments.length) * 80), detail: `เตรียมไฟล์ ${i + 1}/${departmentSources.length} สำหรับ ${department}` };
            await distRef.update({ reissueProgress: progress });
            if (requestRef) await requestRef.update({ processingPercent: progress.percent, processingDetail: progress.detail });
          }
        }
        prepared[department] = { paths, sourcePaths: departmentSources, keys: paths.map(path => path.split('/').pop()), names: paths.map((_, i) => fileNames[i] || `document-${i + 1}.pdf`), departmentKey: safeSegment(department) };
      }
      const allocation = Object.fromEntries((master.distributionDepartments || []).map(row => [canonical(row.dept), row.copies]));
      const result = { distributionId, requestId, departments, fileCount: Object.values(prepared).reduce((sum, files) => sum + files.paths.length, 0) };
      await db.runTransaction(async tx => {
        const [snapshot, freshMaster, freshRequest] = await Promise.all([tx.get(distRef), tx.get(masterRef), requestRef ? tx.get(requestRef) : null]);
        const current = snapshot.data();
        if (!snapshot.exists || current.status === 'CANCELLED' || current.reissueLock?.id !== operationId || freshMaster.data()?.currentRevision !== data.revision || freshMaster.data()?.darReferenceId !== data.darReferenceId || freshMaster.data()?.status !== 'ACTIVE') throw new HttpsError('aborted', 'ข้อมูลชุดแจกจ่ายเปลี่ยนไป กรุณารีเฟรช');
        if (requestRef && freshRequest.data()?.status !== 'PROCESSING') throw new HttpsError('aborted', 'สถานะคำขอเปลี่ยนไปแล้ว');
        const now = Date.now();
        // Read fresh receipts at commit time: another department may sign during stamping.
        const { patch, previousReceipts } = buildReopenPatch(current, departments, prepared, allocation, now, operationId, request.auth.uid, stampVersion);
        if (!requestRef && typeof input.instructions === 'string') patch.instructions = input.instructions.trim().slice(0, 2000);
        tx.update(distRef, patch);
        tx.set(operationRef, { status: 'COMPLETED', distributionId, departments, result, previousReceipts, completedAt: new Date(now).toISOString(), completedBy: request.auth.uid });
        if (requestRef) tx.update(requestRef, { status: 'APPROVED', dccDecisionBy: copyRequest.processingByName || request.auth.uid, dccDecisionDate: new Date(now).toISOString(), dccDecisionNote: copyRequest.pendingDecisionNote || 'อนุมัติเปิดสิทธิ์รับเอกสารอีก 3 วันในชุดเดิม', reissuedDistributionId: distributionId, processingDetail: 'เปิดสิทธิ์รับเอกสารในชุดเดิมสำเร็จ', processingPercent: 100, updatedAt: new Date(now).toISOString() });
      });
      committed = true;
      // Notify only the reopened/new departments; notification failure must not undo access.
      try { await notify(distributionId, { ...data, status: 'IN_PROGRESS', notificationSentAt: null, targetDepartments: departments }, operationRef); }
      catch (error) { console.error('REISSUE_NOTIFICATION_FAILED', distributionId, error); }
      return result;
    } catch (error) {
      if (!committed) {
        await db.runTransaction(async tx => {
          const [snapshot, currentRequest] = await Promise.all([tx.get(distRef), requestRef ? tx.get(requestRef) : null]);
          if (snapshot.data()?.reissueLock?.id === operationId) {
            tx.update(distRef, { reissueLock: null, reissueProgress: { operationId, percent: 0, detail: 'เปิดสิทธิ์ไม่สำเร็จ กรุณาลองใหม่' } });
            if (currentRequest?.data()?.status === 'PROCESSING') tx.update(requestRef, { status: 'PENDING', processingError: String(error), processingDetail: 'เปิดสิทธิ์ไม่สำเร็จ สามารถลองอนุมัติใหม่ได้', updatedAt: new Date().toISOString() });
          }
          tx.set(operationRef, { status: 'FAILED', distributionId, error: String(error), failedAt: new Date().toISOString() });
        });
        await Promise.all(generatedPaths.map(path => getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch(() => undefined)));
      }
      throw error;
    }
  };
}

module.exports = { createReissueHandler, buildReopenPatch, earliestReceipt };
