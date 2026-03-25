import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { UserProfile, Question, BloomLevel, WebbLevel } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { PlusCircle, Trash2, Save, Sparkles, Loader2, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, X, Upload, FileText } from 'lucide-react';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import ePub from 'epubjs';
import { useTranslation } from 'react-i18next';

// Set PDF.js worker using unpkg with .mjs extension for modern versions
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;

interface TextEditorProps {
  userProfile: UserProfile;
  onComplete: () => void;
}

export const TextEditor: React.FC<TextEditorProps> = ({ userProfile, onComplete }) => {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
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
        alert(t('unsupported_file_format'));
        return;
      }

      if (extractedText.trim()) {
        setContent(extractedText.trim());
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      } else {
        alert(t('could_not_extract_text'));
      }
    } catch (error) {
      console.error('File parsing error:', error);
      alert(t('error_processing_file'));
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateQuestions = async () => {
    if (!content.trim()) return;
    setIsGenerating(true);
    try {
      const lang = i18n.language === 'pt' ? 'Português' : 'English';
      const prompt = `Analyze this text for Bloom's Taxonomy: ${bloomLevel}, and Webb DOK: ${webbLevel}. 
        Generate 5 multiple-choice questions to test reading comprehension for high school students. 
        Questions must be aligned with the selected cognitive complexity levels (Bloom: ${bloomLevel}, Webb: ${webbLevel}).
        The text is: "${content}". 
        Key vocabulary to emphasize: ${keyVocabulary.join(', ')}.
        Respond ONLY in JSON format following the provided schema. 
        IMPORTANT: The output language MUST be ${lang}.`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: "gemini-3-flash-preview",
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate questions');
      }

      const data = await response.json();
      // The backend returns { text: "..." }
      // We need to parse the JSON string inside data.text
      const generated = JSON.parse(data.text);
      setQuestions(generated);
      setStep('questions');
    } catch (error) {
      console.error('AI generation error:', error);
      alert(t('error_generating_questions'));
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
      alert(t('error_saving_text'));
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
        <h1 className="text-3xl font-bold text-slate-900">{t('create_new_study_text')}</h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${step === 'text' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs">1</span>
            {t('text')}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${step === 'questions' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs">2</span>
            {t('questions')}
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{t('text_title')}</label>
                  <input 
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('text_title_placeholder')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{t('bloom_taxonomy')}</label>
                  <select 
                    value={bloomLevel}
                    onChange={(e) => setBloomLevel(e.target.value as BloomLevel)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    <option value="Remember">{t('bloom_remember')}</option>
                    <option value="Understand">{t('bloom_understand')}</option>
                    <option value="Apply">{t('bloom_apply')}</option>
                    <option value="Analyze">{t('bloom_analyze')}</option>
                    <option value="Evaluate">{t('bloom_evaluate')}</option>
                    <option value="Create">{t('bloom_create')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{t('webb_dok')}</label>
                  <select 
                    value={webbLevel}
                    onChange={(e) => setWebbLevel(e.target.value as WebbLevel)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    <option value="L1">{t('webb_l1')}</option>
                    <option value="L2">{t('webb_l2')}</option>
                    <option value="L3">{t('webb_l3')}</option>
                    <option value="L4">{t('webb_l4')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{t('key_vocabulary_optional')}</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="text"
                    value={vocabInput}
                    onChange={(e) => setVocabInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), vocabInput.trim() && (setKeyVocabulary([...keyVocabulary, vocabInput.trim()]), setVocabInput('')))}
                    placeholder={t('add_important_terms')}
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <button 
                    onClick={() => { if (vocabInput.trim()) { setKeyVocabulary([...keyVocabulary, vocabInput.trim()]); setVocabInput(''); } }}
                    className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    {t('add')}
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
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">{t('content')}</label>
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
                      <span>{isParsing ? t('processing') : t('upload_file_formats')}</span>
                    </button>
                  </div>
                </div>
                <textarea 
                  rows={12}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('paste_text_or_upload')}
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
                <span>{t('generate_questions_ai')}</span>
              </button>
              <button 
                onClick={() => setStep('questions')}
                disabled={!title.trim() || !content.trim()}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg"
              >
                <span>{t('next_step')}</span>
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
                      <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">{t('question')} {qIdx + 1}</label>
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
                            placeholder={`${t('option')} ${oIdx + 1}`}
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
                <span>{t('back_to_text')}</span>
              </button>
              
              <div className="flex gap-4">
                <button 
                  onClick={addQuestion}
                  className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>{t('add_question')}</span>
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || questions.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  <span>{t('save_and_publish')}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
