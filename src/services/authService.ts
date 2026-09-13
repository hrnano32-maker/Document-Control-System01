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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, usernameToInternalEmail } from '../lib/firebase';
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
  allowedViews?: CurrentUserSession['allowedViews'];
}

export const loadDcsProfile = async (user: User): Promise<CurrentUserSession> => {
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  if (!snapshot.exists()) throw new Error('ไม่พบสิทธิ์ผู้ใช้งาน DCC สำหรับบัญชีนี้');

  const profile = snapshot.data() as DcsUserProfile;
  if (!profile.active) throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ DCC');

  const defaultViews: CurrentUserSession['allowedViews'] =
    profile.role === 'DCC_ADMIN'
      ? ['dashboard', 'masterlist', 'dar', 'distribution', 'audit']
      : ['dashboard', 'masterlist', 'dar', 'distribution', 'audit'];

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
    isAuthenticated: true,
    allowedViews: profile.allowedViews || defaultViews,
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
export const changeDcsPassword = async (oldPassword: string, newPassword: string) => {
  if (!auth.currentUser) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  if (!auth.currentUser.email) throw new Error('บัญชีนี้ไม่มีอีเมลสำหรับยืนยันตัวตน');
  await reauthenticateWithCredential(
    auth.currentUser,
    EmailAuthProvider.credential(auth.currentUser.email, oldPassword)
  );
  return updatePassword(auth.currentUser, newPassword);
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
