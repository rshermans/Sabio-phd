import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from '../types';
import { LogIn, LogOut, User, BookOpen, LayoutDashboard, PlusCircle, Loader2, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  userProfile: UserProfile | null;
  onProfileUpdate: (profile: UserProfile | null) => void;
}

export const Header: React.FC<HeaderProps> = ({ userProfile, onProfileUpdate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const toggleLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowLangMenu(false);
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        onProfileUpdate(userDoc.data() as UserProfile);
      } else {
        // Default to student if new user
        const newProfile: UserProfile = {
          uid: user.uid,
          name: user.displayName || 'Estudante',
          email: user.email || '',
          role: 'student'
        };
        await setDoc(doc(db, 'users', user.uid), newProfile);
        onProfileUpdate(newProfile);
      }
    } catch (error: any) {
      // Ignore cancelled popup errors as they are usually user-initiated
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error('Login error:', error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    onProfileUpdate(null);
    navigate('/');
  };

  const toggleRole = async () => {
    if (!userProfile) return;
    const newRole: UserRole = userProfile.role === 'student' ? 'teacher' : 'student';
    const updatedProfile = { ...userProfile, role: newRole };
    await setDoc(doc(db, 'users', userProfile.uid), updatedProfile);
    onProfileUpdate(updatedProfile);
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">{t('app_name')}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {userProfile && (
            <>
              <Link 
                to="/"
                className={`text-sm font-medium transition-colors ${location.pathname === '/' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t('welcome')}
              </Link>
              {userProfile.role === 'teacher' ? (
                <>
                  <Link 
                    to="/dashboard"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {t('dashboard')}
                  </Link>
                  <Link 
                    to="/editor"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/editor' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {t('new_text')}
                  </Link>
                  <Link 
                    to="/classes"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/classes' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {t('classes')}
                  </Link>
                </>
              ) : (
                <>
                  <Link 
                    to="/reader"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/reader' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {t('reader')}
                  </Link>
                  <Link 
                    to="/classes"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/classes' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {t('classes')}
                  </Link>
                </>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button 
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-1"
            >
              <Languages className="w-5 h-5" />
              <span className="text-xs font-bold uppercase">{i18n.language.split('-')[0]}</span>
            </button>
            <AnimatePresence>
              {showLangMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-32 bg-white border border-slate-100 rounded-2xl shadow-xl p-2 z-50"
                >
                  <button 
                    onClick={() => toggleLanguage('pt')}
                    className={`w-full text-left px-4 py-2 rounded-xl text-sm font-bold transition-all ${i18n.language.startsWith('pt') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    Português
                  </button>
                  <button 
                    onClick={() => toggleLanguage('en')}
                    className={`w-full text-left px-4 py-2 rounded-xl text-sm font-bold transition-all ${i18n.language.startsWith('en') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    English
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {userProfile ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleRole}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors"
              >
                Mudar para {userProfile.role === 'student' ? t('teacher') : t('student')}
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-slate-700 hidden sm:inline">{userProfile.name}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title={t('logout')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{isLoggingIn ? t('loading') : t('login')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
