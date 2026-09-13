const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();

async function purgeDistribution(snapshot, reason) {
  const data = snapshot.data();
  if (!data || data.storageStatus === 'PURGED' || !data.fileStoragePath) return;
  try {
    await getStorage().bucket().file(data.fileStoragePath).delete({ ignoreNotFound: true });
    await snapshot.ref.update({
      storageStatus: 'PURGED',
      ...(reason === 'DOWNLOAD_WINDOW_EXPIRED' && data.status !== 'COMPLETED' ? { status: 'EXPIRED' } : {}),
      fileDeletedAt: new Date().toISOString(),
      purgeReason: reason,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('PURGE_FAILED', snapshot.id, error);
    await snapshot.ref.update({ storageStatus: 'PURGE_PENDING', purgeError: String(error), updatedAt: new Date().toISOString() });
  }
}

exports.purgeCompletedDistribution = onDocumentUpdated('dcs_distributions/{distributionId}', async event => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status !== 'COMPLETED' && after.status === 'COMPLETED') {
    const allDownloaded = Array.isArray(after.targetDepartments)
      && after.targetDepartments.length > 0
      && after.targetDepartments.every(dept => after.receipts?.[dept]?.downloadedAt);
    if (!allDownloaded) {
      await event.data.after.ref.update({ status: 'IN_PROGRESS', storageStatus: 'AVAILABLE', allDownloadedAt: null });
      return;
    }
    await purgeDistribution(event.data.after, 'ALL_DEPARTMENTS_DOWNLOADED');
  }
});

exports.purgeExpiredDistributions = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  const now = Date.now();
  const snapshots = await getFirestore().collection('dcs_distributions')
    .where('expirationEpoch', '<=', now)
    .where('storageStatus', 'in', ['AVAILABLE', 'PURGE_PENDING'])
    .get();
  await Promise.all(snapshots.docs.map(snapshot => purgeDistribution(snapshot, 'DOWNLOAD_WINDOW_EXPIRED')));
});
