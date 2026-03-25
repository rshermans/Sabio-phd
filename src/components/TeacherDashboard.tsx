import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { TextContent, StudentProgress, UserProfile, ChatMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, BookOpen, Clock, TrendingUp, Trash2, ChevronRight, MessageSquare, AlertCircle, Loader2, X, Sparkles } from 'lucide-react';
import { OperationType, FirestoreErrorInfo } from '../types';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface TeacherDashboardProps {
  userProfile: UserProfile;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ userProfile }) => {
  const { t } = useTranslation();
  const [myTexts, setMyTexts] = useState<TextContent[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentProgress | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'texts'), where('teacherId', '==', userProfile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTexts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TextContent));
      setMyTexts(fetchedTexts);
      if (fetchedTexts.length > 0 && !selectedTextId) {
        setSelectedTextId(fetchedTexts[0].id);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'texts');
    });
    return () => unsubscribe();
  }, [userProfile.uid]);

  useEffect(() => {
    if (selectedTextId) {
      const q = query(collection(db, `texts/${selectedTextId}/progress`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const progress = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentProgress));
        setStudentProgress(progress.sort((a, b) => (b.lastActive?.seconds || 0) - (a.lastActive?.seconds || 0)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `texts/${selectedTextId}/progress`);
      });
      return () => unsubscribe();
    }
  }, [selectedTextId]);

  const handleDeleteText = async (textId: string) => {
    if (window.confirm(t('confirm_delete_text'))) {
      try {
        await deleteDoc(doc(db, 'texts', textId));
        if (selectedTextId === textId) {
          setSelectedTextId(myTexts.find(t => t.id !== textId)?.id || null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `texts/${textId}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-64px)] flex flex-col lg:flex-row gap-8">
      {/* Sidebar: My Texts */}
      <div className="w-full lg:w-80 flex flex-col bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5" />
            <h3 className="font-bold">{t('my_texts')}</h3>
          </div>
          <Link to="/editor" className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
            <TrendingUp className="w-4 h-4 rotate-45" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {myTexts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t('no_texts_found')}</p>
            </div>
          ) : (
            myTexts.map(text => (
              <button
                key={text.id}
                onClick={() => setSelectedTextId(text.id)}
                className={`w-full text-left p-4 rounded-2xl transition-all flex items-center justify-between group ${
                  selectedTextId === text.id ? 'bg-emerald-50 text-emerald-700 border-emerald-100 border' : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    <p className="font-bold truncate text-sm">{text.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {text.bloomLevel && (
                        <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Bloom: {text.bloomLevel}</span>
                      )}
                      {text.webbLevel && (
                        <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Webb: {text.webbLevel}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs opacity-60">{new Date(text.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteText(text.id); }}
                    className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main: Student Progress */}
      <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('real_time_tracking')}</h2>
            <p className="text-slate-500 text-sm">{t('student_monitoring')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="font-bold">{studentProgress.length} {t('active_students')}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {selectedTextId ? (
            studentProgress.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Users className="w-16 h-16 mb-4 opacity-10" />
                <p className="text-lg font-medium">{t('no_students_yet')}</p>
                <p className="text-sm">{t('share_text_with_class')}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-12 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="col-span-4">{t('student')}</div>
                  <div className="col-span-3">{t('comprehension')}</div>
                  <div className="col-span-3">{t('last_activity')}</div>
                  <div className="col-span-2 text-right">{t('actions')}</div>
                </div>
                {studentProgress.map(progress => (
                  <motion.div 
                    key={progress.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-12 items-center p-4 bg-white border border-slate-100 rounded-2xl hover:shadow-md transition-all group"
                  >
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                        {progress.studentName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{progress.studentName}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[150px]">{progress.notes || t('no_notes')}</p>
                      </div>
                    </div>
                    
                    <div className="col-span-3 pr-8">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${
                          progress.comprehensionScore >= 80 ? 'text-emerald-600' : 
                          progress.comprehensionScore >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {Math.round(progress.comprehensionScore)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress.comprehensionScore}%` }}
                          className={`h-full rounded-full ${
                            progress.comprehensionScore >= 80 ? 'bg-emerald-500' : 
                            progress.comprehensionScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="col-span-3 flex items-center gap-2 text-slate-500 text-sm">
                      <Clock className="w-4 h-4" />
                      <span>{progress.lastActive?.seconds ? new Date(progress.lastActive.seconds * 1000).toLocaleTimeString() : ''}</span>
                    </div>

                    <div className="col-span-2 text-right">
                      <button 
                        onClick={() => setSelectedStudent(progress)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <BookOpen className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-lg font-medium">{t('select_text_to_see_details')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat History Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {selectedStudent.studentName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{selectedStudent.studentName}</h3>
                    <p className="text-xs text-white/70">{t('ai_interactions')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 custom-scrollbar">
                {selectedStudent.chatHistory && selectedStudent.chatHistory.length > 0 ? (
                  selectedStudent.chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-emerald-600 text-white rounded-tr-none' 
                          : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-2">
                        {msg.role === 'user' ? t('student') : t('ai_tutor')} • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-10" />
                    <p>{t('no_ai_interactions')}</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{t('comprehension')}</span>
                    <span className="text-xl font-black text-slate-900">{Math.round(selectedStudent.comprehensionScore)}%</span>
                  </div>
                  <div className="w-px h-8 bg-slate-100 mx-2" />
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{t('study_time')}</span>
                    <span className="text-xl font-black text-slate-900">{Math.floor((selectedStudent.timeSpent || 0) / 60)}m</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
                >
                  {t('close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
