const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
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

exports.purgeExpiredDistributions = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Bangkok',
  region: 'asia-southeast1',
}, async () => {
  const now = Date.now();
  const db = getFirestore();
  const [completed, expired] = await Promise.all([
    db.collection('dcs_distributions').where('storageStatus', '==', 'PURGE_PENDING').get(),
    db.collection('dcs_distributions')
    .where('expirationEpoch', '<=', now)
    .where('storageStatus', 'in', ['AVAILABLE', 'PURGE_PENDING'])
    .get(),
  ]);
  const completedIds = new Set(completed.docs.map(snapshot => snapshot.id));
  await Promise.all([
    ...completed.docs.map(snapshot => purgeDistribution(snapshot, 'ALL_DEPARTMENTS_DOWNLOADED')),
    ...expired.docs.filter(snapshot => !completedIds.has(snapshot.id)).map(snapshot => purgeDistribution(snapshot, 'DOWNLOAD_WINDOW_EXPIRED')),
  ]);
});
