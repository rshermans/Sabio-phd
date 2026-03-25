import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { TextContent, Question, StudentProgress, StudentAnswer, UserProfile, ChatMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, CheckCircle, XCircle, HelpCircle, MessageSquare, Sparkles, ChevronRight, ChevronLeft, Send, Loader2, Share2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { OperationType, FirestoreErrorInfo } from '../types';

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

interface TextReaderProps {
  userProfile: UserProfile;
}

export const TextReader: React.FC<TextReaderProps> = ({ userProfile }) => {
  const { textId: urlTextId } = useParams<{ textId: string }>();
  const navigate = useNavigate();
  const [texts, setTexts] = useState<TextContent[]>([]);
  const [selectedText, setSelectedText] = useState<TextContent | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [aiChat, setAiChat] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timeSpent, setTimeSpent] = useState(0);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Initialize AI
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  useEffect(() => {
    const fetchTexts = async () => {
      try {
        const q = query(collection(db, 'texts'));
        const snapshot = await getDocs(q);
        const fetchedTexts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TextContent));
        setTexts(fetchedTexts);
        setLoading(false);

        // Handle deep link
        if (urlTextId) {
          const text = fetchedTexts.find(t => t.id === urlTextId);
          if (text) {
            handleSelectText(text);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'texts');
      }
    };
    fetchTexts();
  }, []);

  useEffect(() => {
    if (selectedText) {
      const q = query(collection(db, `texts/${selectedText.id}/questions`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
        setQuestions(fetchedQuestions);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `texts/${selectedText.id}/questions`);
      });
      return () => unsubscribe();
    }
  }, [selectedText]);

  useEffect(() => {
    let timer: any;
    if (selectedText) {
      timer = setInterval(() => {
        setTimeSpent(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [selectedText]);

  // Periodic progress save
  useEffect(() => {
    let saveInterval: any;
    if (selectedText) {
      saveInterval = setInterval(async () => {
        saveProgress();
      }, 15000); // Save every 15 seconds to be less aggressive
    }
    return () => {
      if (saveInterval) clearInterval(saveInterval);
    };
  }, [selectedText, timeSpent]);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedText) {
        saveProgress();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedText, timeSpent]);

  const saveProgress = async () => {
    if (!selectedText) return;
    
    setIsSaving(true);
    try {
      const scrollPos = textContainerRef.current?.scrollTop || 0;
      
      // Get current progress to preserve score and notes
      const progressDoc = await getDoc(doc(db, `texts/${selectedText.id}/progress`, userProfile.uid));
      const currentData = progressDoc.exists() ? progressDoc.data() as StudentProgress : null;

      const progressData: StudentProgress = {
        id: userProfile.uid,
        textId: selectedText.id,
        studentId: userProfile.uid,
        studentName: userProfile.name,
        comprehensionScore: currentData?.comprehensionScore || 0,
        scrollPosition: scrollPos,
        timeSpent: timeSpent,
        lastActive: serverTimestamp(),
        notes: currentData?.notes || 'Leitura em curso...',
        chatHistory: aiChat
      };
      
      await setDoc(doc(db, `texts/${selectedText.id}/progress`, userProfile.uid), progressData, { merge: true });
    } catch (error) {
      console.error('Error saving progress:', error);
    } finally {
      setTimeout(() => setIsSaving(false), 2000);
    }
  };

  const handleSelectText = async (text: TextContent) => {
    setSelectedText(text);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResults(false);
    
    // Fetch existing progress
    const progressDoc = await getDoc(doc(db, `texts/${text.id}/progress`, userProfile.uid));
    if (progressDoc.exists()) {
      const data = progressDoc.data() as StudentProgress;
      setTimeSpent(data.timeSpent || 0);
      setAiChat(data.chatHistory || [{ 
        role: 'model', 
        text: `Olá ${userProfile.name}! Estou aqui para ajudar-te a compreender o texto "${text.title}". Podes perguntar-me qualquer coisa sobre o conteúdo, vocabulário ou contexto histórico.`,
        timestamp: new Date().toISOString()
      }]);
      // We'll restore scroll position after the component renders the text
      setTimeout(() => {
        if (textContainerRef.current && data.scrollPosition) {
          textContainerRef.current.scrollTop = data.scrollPosition;
        }
      }, 100);
    } else {
      setTimeSpent(0);
      setAiChat([{ 
        role: 'model', 
        text: `Olá ${userProfile.name}! Estou aqui para ajudar-te a compreender o texto "${text.title}". Podes perguntar-me qualquer coisa sobre o conteúdo, vocabulário ou contexto histórico.`,
        timestamp: new Date().toISOString()
      }]);
    }

    // Update URL without reloading
    navigate(`/reader/${text.id}`);
  };

  const handleShare = (e?: React.MouseEvent, textId?: string) => {
    if (e) e.stopPropagation();
    const id = textId || selectedText?.id;
    if (!id) return;
    
    const shareUrl = `${window.location.origin}/#/reader/${id}`;
    navigator.clipboard.writeText(shareUrl);
    
    if (textId) {
      setCopiedId(textId);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    }
  };

  const handleAnswer = async (questionId: string, optionIndex: number) => {
    if (!selectedText) return;
    
    const isCorrect = questions[currentQuestionIndex].correctAnswer === optionIndex;
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));

    // Save answer to tracking
    const answerData: StudentAnswer = {
      id: `${userProfile.uid}_${questionId}`,
      textId: selectedText.id,
      studentId: userProfile.uid,
      questionId,
      isCorrect,
      timestamp: serverTimestamp()
    };
    await setDoc(doc(db, `texts/${selectedText.id}/answers`, answerData.id), answerData);

    // Update progress
    const correctCount = Object.values({ ...answers, [questionId]: optionIndex }).filter((ans, idx) => {
      const q = questions.find(q => q.id === Object.keys({ ...answers, [questionId]: optionIndex })[idx]);
      return q && q.correctAnswer === ans;
    }).length;
    
    const score = (correctCount / questions.length) * 100;
    
    const scrollPos = textContainerRef.current?.scrollTop || 0;

    const progressData: StudentProgress = {
      id: userProfile.uid,
      textId: selectedText.id,
      studentId: userProfile.uid,
      studentName: userProfile.name,
      comprehensionScore: score,
      scrollPosition: scrollPos,
      timeSpent: timeSpent,
      lastActive: serverTimestamp(),
      notes: `Estudante respondeu à pergunta ${currentQuestionIndex + 1}.`,
      chatHistory: aiChat
    };
    await setDoc(doc(db, `texts/${selectedText.id}/progress`, userProfile.uid), progressData, { merge: true });
  };

  const handleAiAsk = async (customPrompt?: string) => {
    const prompt = customPrompt || userInput;
    if (!prompt.trim() || !selectedText) return;
    
    const newUserMessage: ChatMessage = { role: 'user', text: prompt, timestamp: new Date().toISOString() };
    const updatedChat = [...aiChat, newUserMessage];
    setAiChat(updatedChat);
    setUserInput('');
    setIsAiLoading(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `És o motor de inteligência literária Sábio. O teu objetivo é sustentar um workflow de aprendizagem personalizado para o Ensino Secundário em Portugal.
          
          CONTEXTO PEDAGÓGICO:
          - Texto em estudo: "${selectedText.content}"
          - Nível Alvo (CEFR): ${selectedText.targetLevel || 'B1'}
          - Taxonomia de Bloom: ${selectedText.bloomLevel || 'Understand'}
          - Webb DOK: ${selectedText.webbLevel || 'L1'}
          - Vocabulário Chave: ${selectedText.keyVocabulary?.join(', ') || 'Nenhum especificado'}
          - Modelo de Avaliação: Segue rigorosamente o "Modelo Unificado Sábio" (Níveis 1 a 5).
          - Justiça Algorítmica: Sê imparcial, justifica todas as avaliações com base em evidências textuais.
          - Técnica Perplexity: Fornece análises profundas, citando o contexto histórico e recursos expressivos.
          
          DIRETRIZES DE RESPOSTA:
          1. Responde sempre de forma pedagógica e incentivadora.
          2. Usa o Novo Acordo Ortográfico.
          3. Enfatiza o vocabulário chave quando relevante para a explicação.
          4. Se o aluno pedir uma pergunta, cria uma de "interpretação profunda" baseada no Grupo I dos exames nacionais.
          5. Se o aluno submeter uma resposta longa, avalia-a de 1 a 5 nos parâmetros: Conteúdo, Estruturação e Linguística.`,
        },
      });

      const response = await chat.sendMessage({ message: prompt });
      const modelResponse: ChatMessage = { 
        role: 'model', 
        text: response.text || 'Desculpa, não consegui processar a tua pergunta.',
        timestamp: new Date().toISOString()
      };
      const finalChat = [...updatedChat, modelResponse];
      setAiChat(finalChat);
      
      // Update teacher dashboard with AI interaction summary
      const progressDoc = await getDoc(doc(db, `texts/${selectedText.id}/progress`, userProfile.uid));
      if (progressDoc.exists()) {
        const currentProgress = progressDoc.data() as StudentProgress;
        const scrollPos = textContainerRef.current?.scrollTop || 0;
        await setDoc(doc(db, `texts/${selectedText.id}/progress`, userProfile.uid), {
          ...currentProgress,
          notes: `Aluno interagiu com IA: "${prompt.substring(0, 50)}..."`,
          scrollPosition: scrollPos,
          timeSpent: timeSpent,
          lastActive: serverTimestamp(),
          chatHistory: finalChat
        }, { merge: true });
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiChat(prev => [...prev, { role: 'model', text: 'Ocorreu um erro ao contactar o tutor IA. Tenta novamente mais tarde.', timestamp: new Date().toISOString() }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const suggestQuestion = () => {
    handleAiAsk("Gera uma pergunta de interpretação profunda sobre este texto, seguindo a estrutura do Grupo I do Exame Nacional, para testar a minha capacidade de análise crítica.");
  };

  const handleGrammarAnalysis = async () => {
    if (!selectedText) return;
    const prompt = `Analisa a gramática do texto "${selectedText.title}" e oferece correções ou sugestões de melhoria de forma pedagógica e construtiva. O texto é: "${selectedText.content}"`;
    await handleAiAsk(prompt);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!selectedText) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Escolhe um texto para estudar</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {texts.map(text => (
            <motion.div 
              key={text.id}
              whileHover={{ y: -4 }}
              onClick={() => handleSelectText(text)}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <BookOpen className="text-emerald-600 w-6 h-6" />
                </div>
                <button 
                  onClick={(e) => handleShare(e, text.id)}
                  className={`p-2 rounded-lg transition-all ${
                    copiedId === text.id 
                      ? 'bg-emerald-100 text-emerald-600' 
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  }`}
                  title="Partilhar"
                >
                  {copiedId === text.id ? <CheckCircle className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                </button>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">{text.title}</h2>
              <p className="text-slate-500 text-sm line-clamp-3 mb-4">{text.content}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Professor ID: {text.teacherId.substring(0, 8)}</span>
                <span>{new Date(text.createdAt?.seconds * 1000).toLocaleDateString()}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-64px)] flex flex-col lg:flex-row gap-8">
      {/* Left: Text Content and Questions */}
      <div 
        ref={textContainerRef}
        className="flex-1 overflow-y-auto pr-4 custom-scrollbar"
      >
        <button 
          onClick={async () => {
            await saveProgress();
            setSelectedText(null);
            navigate('/reader');
          }}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar aos textos</span>
        </button>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <BookOpen className="w-3 h-3" />
              <span>Tempo de estudo: {Math.floor(timeSpent / 60)}m {timeSpent % 60}s</span>
            </div>
            <AnimatePresence>
              {isSaving && (
                <motion.span 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Progresso guardado
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between mb-6 gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-tight mb-2">{selectedText.title}</h1>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
                  CEFR: {selectedText.targetLevel}
                </span>
                {selectedText.bloomLevel && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md uppercase tracking-wider" title="Taxonomia de Bloom">
                    Bloom: {selectedText.bloomLevel}
                  </span>
                )}
                {selectedText.webbLevel && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-md uppercase tracking-wider" title="Webb Depth of Knowledge">
                    Webb: {selectedText.webbLevel}
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={handleShare}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shrink-0 ${
                shareStatus === 'copied' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {shareStatus === 'copied' ? <CheckCircle className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{shareStatus === 'copied' ? 'Copiado!' : 'Partilhar'}</span>
            </button>
          </div>
          <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
            {selectedText.content}
          </div>
        </div>

        {questions.length > 0 && (
          <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200 mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Verificação de Compreensão</h2>
              <span className="text-sm font-medium text-slate-500">Questão {currentQuestionIndex + 1} de {questions.length}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={currentQuestionIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <p className="text-lg font-medium text-slate-800">{questions[currentQuestionIndex].question}</p>
                <div className="grid gap-3">
                  {questions[currentQuestionIndex].options.map((option, idx) => {
                    const isSelected = answers[questions[currentQuestionIndex].id] === idx;
                    const isCorrect = questions[currentQuestionIndex].correctAnswer === idx;
                    const showFeedback = answers[questions[currentQuestionIndex].id] !== undefined;

                    let bgColor = 'bg-white hover:bg-slate-100';
                    let borderColor = 'border-slate-200';
                    let textColor = 'text-slate-700';

                    if (showFeedback) {
                      if (isCorrect) {
                        bgColor = 'bg-emerald-50';
                        borderColor = 'border-emerald-500';
                        textColor = 'text-emerald-700';
                      } else if (isSelected) {
                        bgColor = 'bg-red-50';
                        borderColor = 'border-red-500';
                        textColor = 'text-red-700';
                      }
                    } else if (isSelected) {
                      bgColor = 'bg-emerald-50';
                      borderColor = 'border-emerald-500';
                    }

                    return (
                      <button
                        key={idx}
                        disabled={showFeedback}
                        onClick={() => handleAnswer(questions[currentQuestionIndex].id, idx)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ${bgColor} ${borderColor} ${textColor}`}
                      >
                        <span>{option}</span>
                        {showFeedback && isCorrect && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {showFeedback && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-between mt-8">
              <button
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
              <button
                disabled={currentQuestionIndex === questions.length - 1}
                onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 disabled:opacity-30"
              >
                <span>Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: AI Tutor Chat */}
      <div className="w-full lg:w-96 flex flex-col bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-bold">Tutor IA EduPorto</h3>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleGrammarAnalysis}
              disabled={isAiLoading}
              className="text-[10px] uppercase tracking-wider font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
            >
              Gramática
            </button>
            <button 
              onClick={suggestQuestion}
              disabled={isAiLoading}
              className="text-[10px] uppercase tracking-wider font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
            >
              Sugerir Pergunta
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {aiChat.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white rounded-br-none' 
                  : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-bl-none'
              }`}>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isAiLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 p-4 rounded-3xl rounded-bl-none border border-slate-100 flex gap-1 shadow-sm">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2 bg-slate-50/50">
          <input 
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAiAsk()}
            placeholder="Pergunta ao tutor..."
            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
          />
          <button 
            onClick={() => handleAiAsk()}
            disabled={isAiLoading || !userInput.trim()}
            className="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
