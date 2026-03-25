import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, arrayUnion, serverTimestamp, getDocs } from 'firebase/firestore';
import { UserProfile, Class } from '../types';
import { Users, Plus, UserPlus, Copy, Check, Trash2, Loader2, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface ClassManagementProps {
  userProfile: UserProfile;
}

export const ClassManagement: React.FC<ClassManagementProps> = ({ userProfile }) => {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const classesRef = collection(db, 'classes');
    let q;
    
    if (userProfile.role === 'teacher') {
      q = query(classesRef, where('teacherId', '==', userProfile.uid));
    } else {
      q = query(classesRef, where('studentIds', 'array-contains', userProfile.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const classesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(classesData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [userProfile.uid, userProfile.role]);

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const inviteCode = generateInviteCode();
      await addDoc(collection(db, 'classes'), {
        name: newClassName,
        teacherId: userProfile.uid,
        teacherName: userProfile.name,
        inviteCode,
        studentIds: [],
        createdAt: serverTimestamp()
      });
      setShowCreateModal(false);
      setNewClassName('');
    } catch (error) {
      console.error('Error creating class:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const q = query(collection(db, 'classes'), where('inviteCode', '==', inviteCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert(t('invalid_invite_code'));
        return;
      }

      const classDoc = querySnapshot.docs[0];
      const classData = classDoc.data() as Class;

      if (classData.studentIds.includes(userProfile.uid)) {
        alert(t('already_in_class'));
        return;
      }

      await updateDoc(doc(db, 'classes', classDoc.id), {
        studentIds: arrayUnion(userProfile.uid)
      });

      setShowJoinModal(false);
      setInviteCode('');
    } catch (error) {
      console.error('Error joining class:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyInviteCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-emerald-600" />
            {t('classes')}
          </h1>
          <p className="text-slate-500 mt-1">{userProfile.role === 'teacher' ? t('manage_your_classes') : t('your_classes')}</p>
        </div>
        
        {userProfile.role === 'teacher' ? (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-100"
          >
            <Plus className="w-5 h-5" />
            {t('create_class')}
          </button>
        ) : (
          <button
            onClick={() => setShowJoinModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-100"
          >
            <UserPlus className="w-5 h-5" />
            {t('join_class')}
          </button>
        )}
      </div>

      {classes.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-12 text-center border-2 border-dashed border-slate-200">
          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('no_classes_yet')}</h2>
          <p className="text-slate-500 max-w-md mx-auto mb-8">
            {userProfile.role === 'teacher' 
              ? t('create_first_class_desc')
              : t('join_first_class_desc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <motion.div
              key={cls.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <GraduationCap className="w-6 h-6 text-emerald-600" />
                </div>
                {userProfile.role === 'teacher' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                      {cls.inviteCode}
                    </span>
                    <button
                      onClick={() => copyInviteCode(cls.inviteCode, cls.id)}
                      className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                      title={t('copy_invite_code')}
                    >
                      {copiedId === cls.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">{cls.name}</h3>
              <div className="flex items-center gap-4 text-slate-500 text-sm">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{cls.studentIds.length} {t('students')}</span>
                </div>
                {userProfile.role === 'student' && (
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{cls.teacherName}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Class Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-black text-slate-900 mb-6">{t('create_new_class')}</h2>
              <form onSubmit={handleCreateClass}>
                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('class_name')}</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder={t('class_name_placeholder')}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all"
                    required
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('create')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join Class Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-black text-slate-900 mb-6">{t('join_a_class')}</h2>
              <form onSubmit={handleJoinClass}>
                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('invite_code')}</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all text-center font-mono text-2xl tracking-widest"
                    required
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowJoinModal(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('join')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
