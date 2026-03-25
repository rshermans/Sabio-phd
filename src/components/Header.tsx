import React from 'react';
import { auth, db } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from '../types';
import { LogIn, LogOut, User, BookOpen, LayoutDashboard, PlusCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface HeaderProps {
  userProfile: UserProfile | null;
  onProfileUpdate: (profile: UserProfile | null) => void;
}

export const Header: React.FC<HeaderProps> = ({ userProfile, onProfileUpdate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

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
          <span className="text-xl font-bold tracking-tight text-slate-900">Sábio</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {userProfile && (
            <>
              <Link 
                to="/"
                className={`text-sm font-medium transition-colors ${location.pathname === '/' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Início
              </Link>
              {userProfile.role === 'teacher' ? (
                <>
                  <Link 
                    to="/dashboard"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Painel do Professor
                  </Link>
                  <Link 
                    to="/editor"
                    className={`text-sm font-medium transition-colors ${location.pathname === '/editor' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Criar Texto
                  </Link>
                </>
              ) : (
                <Link 
                  to="/reader"
                  className={`text-sm font-medium transition-colors ${location.pathname === '/reader' ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Meus Estudos
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-4">
          {userProfile ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleRole}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors"
              >
                Mudar para {userProfile.role === 'student' ? 'Professor' : 'Aluno'}
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
                title="Sair"
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
              <span>{isLoggingIn ? 'A entrar...' : 'Entrar'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
