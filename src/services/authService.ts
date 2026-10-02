import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  User,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, firebaseFunctions, usernameToInternalEmail } from '../lib/firebase';
import { CurrentUserSession, Department } from '../types';

export interface DcsUserProfile {
  username: string;
  department: Department;
  role: 'DCC_ADMIN' | 'DEPT_CONTROLLER';
  roleName: 'DCC / Admin' | 'Department User';
  active: boolean;
  displayName: string;
  empId?: string;
  position: string;
  signaturePath?: string;
  allowedViews?: CurrentUserSession['allowedViews'];
  mustChangePassword?: boolean;
}

export const loadDcsProfile = async (user: User): Promise<CurrentUserSession> => {
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  if (!snapshot.exists()) throw new Error('ไม่พบสิทธิ์ผู้ใช้งาน DCC สำหรับบัญชีนี้');

  const profile = snapshot.data() as DcsUserProfile;
  if (!profile.active) throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ DCC');

  const defaultViews: CurrentUserSession['allowedViews'] =
    profile.role === 'DCC_ADMIN'
      ? ['dashboard', 'masterlist', 'dar', 'distribution', 'audit', 'announcements']
      : ['dashboard', 'masterlist', 'dar', 'distribution', 'audit', 'announcements'];

  const allowedViews = [...(profile.allowedViews || defaultViews)];
  if (profile.role === 'DCC_ADMIN' && !allowedViews.includes('registrations')) allowedViews.push('registrations');
  if (!allowedViews.includes('announcements')) allowedViews.push('announcements');

  return {
    uid: user.uid,
    currentDept: profile.department,
    username: profile.username,
    userName: profile.displayName,
    userEmpId: profile.empId || '',
    userRole: profile.role,
    roleName: profile.roleName,
    deptDescriptionTh: profile.department,
    position: profile.position,
    signaturePath: profile.signaturePath || '',
    isAuthenticated: true,
    mustChangePassword: profile.mustChangePassword === true,
    allowedViews,
  };
};

export const signInDcsUser = async (username: string, password: string, remember: boolean) => {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, usernameToInternalEmail(username), password);
  try {
    return await loadDcsProfile(credential.user);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
};

export const signOutDcsUser = () => signOut(auth);
export const updateOwnSignature = async (signatureDataUrl: string) => {
  const result = await httpsCallable<{ signatureDataUrl: string }, { signaturePath: string }>(
    firebaseFunctions,
    'updateOwnSignature',
    { timeout: 60000 },
  )({ signatureDataUrl });
  return result.data.signaturePath;
};
export const changeDcsPassword = async (oldPassword: string, newPassword: string) => {
  if (!auth.currentUser) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!auth.currentUser.email) throw new Error('บัญชีนี้ไม่มีอีเมลสำหรับยืนยันตัวตน');
  await reauthenticateWithCredential(
    auth.currentUser,
    EmailAuthProvider.credential(auth.currentUser.email, oldPassword)
  );
  await updatePassword(auth.currentUser, newPassword);
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { mustChangePassword: false });
};

export const observeDcsAuth = (callback: (session: CurrentUserSession | null) => void) =>
  onAuthStateChanged(auth, async user => {
    if (!user) return callback(null);
    try {
      callback(await loadDcsProfile(user));
    } catch {
      await signOut(auth);
      callback(null);
    }
  });
