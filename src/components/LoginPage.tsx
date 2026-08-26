import React, { useState } from 'react';
import { useDcs } from '../context/DcsContext';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const LoginPage: React.FC<{ onSuccessfulLogin?: () => void }> = ({ onSuccessfulLogin }) => {
  const { login } = useDcs();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!username.trim()) {
      setErrorMessage('กรุณาระบุชื่อผู้ใช้งาน (Username)');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('กรุณาระบุรหัสผ่าน (Password)');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const res = login(username, password);
      setIsSubmitting(false);
      if (res.success) {
        setSuccessMessage(res.message);
        if (onSuccessfulLogin) onSuccessfulLogin();
      } else {
        setErrorMessage(res.message);
      }
    }, 200);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background Subtle Ambient Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/2 -right-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Content Area */}
      <div className="max-w-md w-full mx-auto space-y-6 relative z-10 my-auto">
        
        {/* Top Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/80 border border-indigo-500/40 rounded-full text-indigo-300 text-xs font-semibold shadow-inner">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>Document Control System • ISO 9001:2015 & IATF 16949</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            เข้าสู่ระบบ <span className="text-indigo-400">DCC e-Control</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            ระบบควบคุมเอกสารอิเล็คทรอนิกส์
          </p>
        </div>

        {/* Sign-in Form Card */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <LogIn className="w-5 h-5 text-indigo-400" />
              เข้าสู่ระบบตามแผนก (Sign In)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              กรอก Username และ Password ประจำหน่วยงาน
            </p>
          </div>

          {/* Status Alert: Error */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/70 border border-rose-600/60 rounded-xl text-rose-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Status Alert: Success */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-950/70 border border-emerald-600/60 rounded-xl text-emerald-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{successMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username Field */}
            <div className="space-y-1.5">
              <label htmlFor="login-username-input" className="block text-xs font-semibold text-slate-300">
                ชื่อผู้ใช้งาน (Username)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  id="login-username-input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="เช่น dcc, qa, production_1, hr..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="login-password-input" className="block text-xs font-semibold text-slate-300">
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="ระบุรหัสผ่านประจำแผนก..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                  title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="btn-login-submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  กำลังตรวจสอบสิทธิ์...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  เข้าสู่ระบบ DCC e-Control
                </>
              )}
            </button>

          </form>

        </div>

      </div>

      {/* Footer info */}
      <div className="text-center text-xs text-slate-500 py-4 border-t border-slate-800/80 relative z-10">
        ระบบควบคุมเอกสารอิเล็กทรอนิกส์ (DCC e-Control) • ISO 9001:2015 ข้อ 7.5.3 & IATF 16949
      </div>

    </div>
  );
};
