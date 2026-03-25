import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { UserProfile, Question, BloomLevel, WebbLevel } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { PlusCircle, Trash2, Save, Sparkles, Loader2, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, X, Upload, FileText } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import ePub from 'epubjs';

// Set PDF.js worker using unpkg with .mjs extension for modern versions
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;

interface TextEditorProps {
  userProfile: UserProfile;
  onComplete: () => void;
}

export const TextEditor: React.FC<TextEditorProps> = ({ userProfile, onComplete }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetLevel, setTargetLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'>('B1');
  const [bloomLevel, setBloomLevel] = useState<BloomLevel>('Understand');
  const [webbLevel, setWebbLevel] = useState<WebbLevel>('L1');
  const [vocabInput, setVocabInput] = useState('');
  const [keyVocabulary, setKeyVocabulary] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Omit<Question, 'id' | 'textId'>[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [step, setStep] = useState<'text' | 'questions'>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      let extractedText = '';

      if (file.name.toLowerCase().endsWith('.docx')) {
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        extractedText = fullText;
      } else if (file.name.toLowerCase().endsWith('.epub')) {
        const book = ePub(arrayBuffer);
        await book.ready;
        const spine = book.spine;
        let fullText = '';
        // @ts-ignore - epubjs types can be tricky
        const items = (book.spine as any).items;
        for (const item of items) {
          const doc = await item.load(book.load.bind(book));
          if (doc && doc.body) {
            fullText += doc.body.innerText + '\n';
          }
        }
        extractedText = fullText;
      } else {
        alert('Formato de ficheiro não suportado. Usa PDF, DOCX ou EPUB.');
        return;
      }

      if (extractedText.trim()) {
        setContent(extractedText.trim());
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      } else {
        alert('Não foi possível extrair texto do ficheiro.');
      }
    } catch (error) {
      console.error('File parsing error:', error);
      alert('Erro ao processar o ficheiro. Tenta novamente.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateQuestions = async () => {
    if (!content.trim()) return;
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analisa este texto para o nível CEFR ${targetLevel}, Taxonomia de Bloom: ${bloomLevel} e Webb DOK: ${webbLevel}. 
        Gera 5 perguntas de escolha múltipla para testar a compreensão de leitura de alunos do ensino secundário em Portugal. 
        As perguntas devem estar alinhadas com os níveis de complexidade cognitiva selecionados (Bloom: ${bloomLevel}, Webb: ${webbLevel}).
        O texto é: "${content}". 
        Vocabulário chave a enfatizar: ${keyVocabulary.join(', ')}.
        Responde apenas em formato JSON seguindo o esquema fornecido.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING, description: "A pergunta" },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "4 opções de resposta"
                },
                correctAnswer: { type: Type.INTEGER, description: "Índice da resposta correta (0-3)" }
              },
              required: ["question", "options", "correctAnswer"]
            }
          }
        }
      });

      const generated = JSON.parse(response.text);
      setQuestions(generated);
      setStep('questions');
    } catch (error) {
      console.error('AI generation error:', error);
      alert('Ocorreu um erro ao gerar as perguntas. Tenta novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const textRef = await addDoc(collection(db, 'texts'), {
        title,
        content,
        teacherId: userProfile.uid,
        createdAt: serverTimestamp(),
        targetLevel,
        bloomLevel,
        webbLevel,
        keyVocabulary
      });

      for (const q of questions) {
        await addDoc(collection(db, `texts/${textRef.id}/questions`), {
          ...q,
          textId: textRef.id
        });
      }

      onComplete();
    } catch (error) {
      console.error('Save error:', error);
      alert('Erro ao guardar o texto.');
    } finally {
      setIsSaving(false);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correctAnswer: 0 }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const newQuestions = [...questions];
    (newQuestions[index] as any)[field] = value;
    setQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options[oIndex] = value;
    setQuestions(newQuestions);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Criar Novo Texto de Estudo</h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${step === 'text' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs">1</span>
            Texto
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${step === 'questions' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs">2</span>
            Questões
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'text' ? (
          <motion.div 
            key="text-step"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Título do Texto</label>
                  <input 
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Os Maias - Episódio do Jantar no Hotel Central"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Nível Alvo (CEFR)</label>
                  <select 
                    value={targetLevel}
                    onChange={(e) => setTargetLevel(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => (
                      <option key={level} value={level}>{level} - {level === 'B1' || level === 'B2' ? 'Intermédio' : level === 'C1' || level === 'C2' ? 'Avançado' : 'Iniciante'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Taxonomia de Bloom</label>
                  <select 
                    value={bloomLevel}
                    onChange={(e) => setBloomLevel(e.target.value as BloomLevel)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    <option value="Remember">Lembrar (Recall)</option>
                    <option value="Understand">Compreender (Understand)</option>
                    <option value="Apply">Aplicar (Apply)</option>
                    <option value="Analyze">Analisar (Analyze)</option>
                    <option value="Evaluate">Avaliar (Evaluate)</option>
                    <option value="Create">Criar (Create)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Webb Depth of Knowledge (DOK)</label>
                  <select 
                    value={webbLevel}
                    onChange={(e) => setWebbLevel(e.target.value as WebbLevel)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    <option value="L1">Nível 1: Reprodução (Recall)</option>
                    <option value="L2">Nível 2: Aplicação de Conceitos</option>
                    <option value="L3">Nível 3: Pensamento Estratégico</option>
                    <option value="L4">Nível 4: Pensamento Extendido</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Vocabulário Chave (Opcional)</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="text"
                    value={vocabInput}
                    onChange={(e) => setVocabInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), vocabInput.trim() && (setKeyVocabulary([...keyVocabulary, vocabInput.trim()]), setVocabInput('')))}
                    placeholder="Adiciona termos importantes..."
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <button 
                    onClick={() => { if (vocabInput.trim()) { setKeyVocabulary([...keyVocabulary, vocabInput.trim()]); setVocabInput(''); } }}
                    className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Adicionar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keyVocabulary.map((v, i) => (
                    <span key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                      {v}
                      <button onClick={() => setKeyVocabulary(keyVocabulary.filter((_, idx) => idx !== i))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">Conteúdo</label>
                  <div className="flex gap-2">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".pdf,.docx,.epub"
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isParsing}
                      className="flex items-center gap-2 text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-all"
                    >
                      {isParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      <span>{isParsing ? 'A processar...' : 'Carregar Ficheiro (PDF/DOCX/EPUB)'}</span>
                    </button>
                  </div>
                </div>
                <textarea 
                  rows={12}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Cola aqui o texto ou carrega um ficheiro..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button 
                onClick={generateQuestions}
                disabled={isGenerating || !content.trim()}
                className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                <span>Gerar Questões com IA</span>
              </button>
              <button 
                onClick={() => setStep('questions')}
                disabled={!title.trim() || !content.trim()}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg"
              >
                <span>Próximo Passo</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="questions-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-6">
              {questions.map((q, qIdx) => (
                <div key={qIdx} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative group">
                  <button 
                    onClick={() => removeQuestion(qIdx)}
                    className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Questão {qIdx + 1}</label>
                      <input 
                        type="text"
                        value={q.question}
                        onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {q.options.map((option, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-3">
                          <button 
                            onClick={() => updateQuestion(qIdx, 'correctAnswer', oIdx)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              q.correctAnswer === oIdx ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <input 
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                            className="flex-1 px-4 py-2 rounded-xl border border-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder={`Opção ${oIdx + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl border border-slate-200">
              <button 
                onClick={() => setStep('text')}
                className="flex items-center gap-2 text-slate-600 font-bold hover:text-slate-900"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Voltar ao Texto</span>
              </button>
              
              <div className="flex gap-4">
                <button 
                  onClick={addQuestion}
                  className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Adicionar Questão</span>
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || questions.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  <span>Guardar e Publicar</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
