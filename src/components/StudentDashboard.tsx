import React from 'react';
import { Link } from 'react-router-dom';
import { UserProfile, LearningPath } from '../types';
import { motion } from 'motion/react';
import { Trophy, Flame, BookOpen, CheckCircle, ChevronRight } from 'lucide-react';

interface StudentDashboardProps {
  userProfile: UserProfile;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ userProfile }) => {
  // Mock data for now - will be replaced by Firestore data
  const learningPath: LearningPath = {
    id: '1',
    title: 'Jornada Literária: Os Maias',
    progress: 45,
    checkpoints: [
      { id: '1', title: 'Leitura: Episódio do Jantar', description: 'Compreensão de leitura', completed: true, type: 'reading' },
      { id: '2', title: 'Quiz: Análise Crítica', description: 'Teste de conhecimentos', completed: false, type: 'quiz' },
      { id: '3', title: 'Chat: Debate com Tutor IA', description: 'Discussão sobre o episódio', completed: false, type: 'chat' },
    ]
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header with Gamification */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2">Olá, {userProfile.name}!</h1>
          <p className="text-slate-500">Continua a tua jornada de aprendizagem.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-orange-50 text-orange-600 px-6 py-3 rounded-2xl flex items-center gap-3 font-bold">
            <Flame className="w-6 h-6" />
            <span>{userProfile.streak || 0} dias de streak</span>
          </div>
          <div className="bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl flex items-center gap-3 font-bold">
            <Trophy className="w-6 h-6" />
            <span>{userProfile.xp || 0} XP</span>
          </div>
        </div>
      </div>

      {/* Learning Path */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">{learningPath.title}</h2>
          <div className="text-sm font-bold text-slate-500">{learningPath.progress}% concluído</div>
        </div>
        
        <div className="space-y-4">
          {learningPath.checkpoints.map((cp, idx) => (
            <div key={cp.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${cp.completed ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cp.completed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {cp.completed ? <CheckCircle className="w-6 h-6" /> : <span>{idx + 1}</span>}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">{cp.title}</h3>
                <p className="text-sm text-slate-500">{cp.description}</p>
              </div>
              {!cp.completed && (
                <Link 
                  to="/reader"
                  className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                >
                  Começar <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
