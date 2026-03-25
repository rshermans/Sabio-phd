import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import { Header } from './components/Header';
import { TextReader } from './components/TextReader';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { TextEditor } from './components/TextEditor';
import { ClassManagement } from './components/ClassManagement';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Users, Sparkles, GraduationCap, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

function AppContent() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Header 
        userProfile={userProfile} 
        onProfileUpdate={setUserProfile} 
      />
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname + (userProfile?.uid || 'guest')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Routes location={location}>
              <Route path="/" element={<LandingPage userProfile={userProfile} />} />
              
              {userProfile ? (
                <>
                  <Route 
                    path="/dashboard" 
                    element={
                      userProfile.role === 'teacher' 
                        ? <TeacherDashboard userProfile={userProfile} /> 
                        : <StudentDashboard userProfile={userProfile} />
                    } 
                  />
                  <Route path="/classes" element={<ClassManagement userProfile={userProfile} />} />
                  <Route path="/reader/:textId" element={<TextReader userProfile={userProfile} />} />
                  <Route path="/reader" element={<TextReader userProfile={userProfile} />} />
                  {userProfile.role === 'teacher' && (
                    <Route path="/editor" element={<TextEditor userProfile={userProfile} onComplete={() => navigate('/dashboard')} />} />
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/" replace />} />
              )}
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

const LandingPage: React.FC<{ userProfile: UserProfile | null }> = ({ userProfile }) => {
  const { t } = useTranslation();
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-16 sm:py-24">
      {/* Hero Section */}
      <div className="text-center mb-24">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold mb-8"
        >
          <Sparkles className="w-4 h-4" />
          <span>{t('app_tagline')}</span>
        </motion.div>
        <h1 className="text-6xl sm:text-7xl font-black text-slate-900 tracking-tight mb-8 leading-[1.1]">
          {t('hero_title').split(' ').slice(0, -1).join(' ')} <br />
          <span className="text-emerald-600">{t('hero_title').split(' ').pop()}</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-12 leading-relaxed">
          {t('hero_subtitle')}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {userProfile ? (
            <Link 
              to="/dashboard"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-2 transition-all shadow-xl shadow-emerald-200"
            >
              <span>{t('dashboard')}</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <p className="text-slate-400 font-medium">{t('login')} {t('get_started')}</p>
          )}
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <FeatureCard 
          icon={<Sparkles className="w-8 h-8 text-emerald-600" />}
          title={t('feature_ai_title')}
          description={t('feature_ai_desc')}
        />
        <FeatureCard 
          icon={<Users className="w-8 h-8 text-blue-600" />}
          title={t('feature_tracking_title')}
          description={t('feature_tracking_desc')}
        />
        <FeatureCard 
          icon={<GraduationCap className="w-8 h-8 text-amber-600" />}
          title={t('feature_gamification_title')}
          description={t('feature_gamification_desc')}
        />
      </div>

      {/* Benefits Section */}
      <div className="mt-32 bg-slate-900 rounded-[3rem] p-12 sm:p-20 text-white overflow-hidden relative">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-8 leading-tight">{t('teacher')}: <br/>{t('real_time_tracking')}</h2>
            <ul className="space-y-6">
              <BenefitItem text={t('feature_tracking_desc')} />
              <BenefitItem text={t('feature_ai_desc')} />
            </ul>
          </div>
          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10">
            <div className="space-y-4">
              <div className="h-4 bg-white/20 rounded-full w-3/4" />
              <div className="h-4 bg-white/20 rounded-full w-1/2" />
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="h-24 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">85%</span>
                  <span className="text-xs opacity-60">{t('comprehension')}</span>
                </div>
                <div className="h-24 bg-blue-500/20 rounded-2xl border border-blue-500/30 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-blue-400">12</span>
                  <span className="text-xs opacity-60">{t('active_students')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ icon: React.ReactNode, title: string, description: string }> = ({ icon, title, description }) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 group">
    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
      {icon}
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-4">{title}</h3>
    <p className="text-slate-500 leading-relaxed">{description}</p>
  </div>
);

const BenefitItem: React.FC<{ text: string }> = ({ text }) => (
  <li className="flex items-center gap-4">
    <div className="bg-emerald-500/20 p-1 rounded-full">
      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
    </div>
    <span className="text-lg text-slate-300">{text}</span>
  </li>
);
