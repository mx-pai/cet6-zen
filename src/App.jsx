import {
  AlertCircle,
  ArrowUpCircle,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Feather,
  Headphones,
  Languages,
  Loader,
  PenLine,
  Plus,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

// --- Local Storage Helpers ---
const STORAGE_KEY = 'cet6-zen-exams';
const DB_NAME = 'cet6-zen-store';
const DB_VERSION = 1;
const PDF_STORE = 'pdfs';

const loadExamsFromStorage = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load exams from localStorage:', error);
    return [];
  }
};

const saveExamsToStorage = (exams) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
  } catch (error) {
    console.error('Failed to save exams to localStorage:', error);
  }
};

const createExamId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `exam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const extractYearFromName = (name) => {
  if (!name) return null;
  const match = String(name).match(/(20\d{2}|19\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  if (Number.isNaN(year)) return null;
  return year;
};

const buildTitleFromFileName = (name) => {
  if (!name) return '未命名六级试卷';
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  return withoutExt
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// --- IndexedDB helpers for storing PDFs ---
const openPdfDb = () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
};

const savePdfForExam = async (examId, file) => {
  try {
    const db = await openPdfDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
      const store = tx.objectStore(PDF_STORE);
      const record = {
        fileName: file.name,
        type: file.type || 'application/pdf',
        blob: file,
        updatedAt: Date.now(),
      };
      store.put(record, examId);
    });
  } catch (error) {
    console.error('Failed to save PDF to IndexedDB:', error);
  }
};

const loadPdfForExam = async (examId) => {
  try {
    const db = await openPdfDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, 'readonly');
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
      const store = tx.objectStore(PDF_STORE);
      const request = store.get(examId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Failed to load PDF'));
    });
  } catch (error) {
    console.error('Failed to load PDF from IndexedDB:', error);
    return null;
  }
};

const deletePdfForExam = async (examId) => {
  try {
    const db = await openPdfDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
      const store = tx.objectStore(PDF_STORE);
      store.delete(examId);
    });
  } catch (error) {
    // Not critical; ignore
    console.warn('Failed to delete PDF from IndexedDB:', error);
  }
};

// --- Components ---
const Spinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
);

// --- Main Application ---
export default function CET6FocusMode() {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'workbench'
  const [exams, setExams] = useState([]);
  const [currentExam, setCurrentExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfLibLoaded, setPdfLibLoaded] = useState(false);

  // Load existing exams from localStorage on mount
  useEffect(() => {
    const storedExams = loadExamsFromStorage();
    const sorted = [...storedExams].sort((a, b) => {
      const aTime = a.lastUpdated || a.createdAt || 0;
      const bTime = b.lastUpdated || b.createdAt || 0;
      return bTime - aTime;
    });
    setExams(sorted);
    setLoading(false);
  }, []);

  // Load PDF.js Script Dynamically
  useEffect(() => {
    if (window.pdfjsLib) {
      setPdfLibLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfLibLoaded(true);
    };
    document.body.appendChild(script);
  }, []);

  // Handlers
  const handleCreateSession = async (title) => {
    const now = Date.now();
    const year = new Date(now).getFullYear();
    const newExam = {
      id: createExamId(),
      title: title || '未命名六级试卷',
      type: 'cet6_standard',
      createdAt: now,
      lastUpdated: now,
      year,
      userAnswers: {},
      notes: ''
    };
    setExams((prev) => {
      const next = [newExam, ...prev];
      saveExamsToStorage(next);
      return next;
    });
    return newExam.id;
  };

  const handleDeleteExam = async (examId, e) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这份做题记录吗？")) return;
    deletePdfForExam(examId);
    setExams((prev) => {
      const next = prev.filter((exam) => exam.id !== examId);
      saveExamsToStorage(next);
      return next;
    });
    if (currentExam && currentExam.id === examId) {
      setCurrentExam(null);
      setView('dashboard');
    }
  };

  const handleUpdateProgress = async (examId, answers, notes, annotations, elapsedSeconds) => {
    setExams((prev) => {
      const next = prev.map((exam) =>
        exam.id === examId
          ? {
              ...exam,
              userAnswers: answers,
              notes,
              annotations: annotations || exam.annotations || {},
              elapsedSeconds: typeof elapsedSeconds === 'number'
                ? elapsedSeconds
                : exam.elapsedSeconds || 0,
              lastUpdated: Date.now()
            }
          : exam
      );
      saveExamsToStorage(next);
      const updated = next.find((exam) => exam.id === examId);
      if (updated) {
        setCurrentExam(updated);
      }
      return next;
    });
  };

  const handleBulkImport = async (files) => {
    if (!files || !files.length) return;
    const now = Date.now();
    const newExams = [];
    for (const file of files) {
      const id = createExamId();
      const year = extractYearFromName(file.name) || new Date(now).getFullYear();
      const exam = {
        id,
        title: buildTitleFromFileName(file.name),
        type: 'cet6_standard',
        createdAt: now,
        lastUpdated: now,
        year,
        sourceFileName: file.name,
        userAnswers: {},
        notes: ''
      };
      newExams.push(exam);
      // Fire and forget; data is also kept in IndexedDB
      savePdfForExam(id, file);
    }
    setExams((prev) => {
      const next = [...newExams, ...prev];
      // Sort by lastUpdated desc so newest imports appear在前面
      next.sort((a, b) => {
        const aTime = a.lastUpdated || a.createdAt || 0;
        const bTime = b.lastUpdated || b.createdAt || 0;
        return bTime - aTime;
      });
      saveExamsToStorage(next);
      return next;
    });
  };

  const openExam = (exam) => {
    setCurrentExam(exam);
    setView('workbench');
  };

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 font-sans flex flex-col h-screen">
      {/* Header only on dashboard; workbench 把品牌放进右侧面板 */}
      {view === 'dashboard' && (
        <header className="bg-white border-b border-slate-200 flex-shrink-0 z-20">
          <div className="max-w-full px-4 h-14 flex items-center justify-between">
            <div
              className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setView('dashboard')}
            >
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">
                CET-6 Focus
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-xs text-slate-400 font-mono">
                离线模式 · 本地保存
              </span>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-grow overflow-hidden relative">
        {view === 'dashboard' && (
          <Dashboard
            exams={exams}
            onOpen={openExam}
            onDelete={handleDeleteExam}
            onCreate={handleCreateSession}
            onBulkImport={handleBulkImport}
          />
        )}
        {view === 'workbench' && currentExam && (
          <Workbench
            exam={currentExam}
            onBack={() => setView('dashboard')}
            onAutoSave={handleUpdateProgress}
            pdfLibLoaded={pdfLibLoaded}
          />
        )}
      </div>
    </div>
  );
}

// --- Dashboard Component ---
const Dashboard = ({ exams, onOpen, onDelete, onCreate, onBulkImport }) => {
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [collapsedYears, setCollapsedYears] = useState({});
  const [newTitle, setNewTitle] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onCreate(newTitle);
    setShowModal(false);
    setNewTitle('');
  };

  const openModal = () => {
    const date = new Date();
    setNewTitle(`${date.getFullYear()}年${date.getMonth() + 1}月 六级真题`);
    setShowModal(true);
  };

  const handleBulkFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await onBulkImport(files);
    setShowBulkModal(false);
    // Allow selecting the same files again later if needed
    e.target.value = '';
  };

  // Group exams by year for display
  const groupedByYear = exams.reduce((acc, exam) => {
    const key = exam.year || '未分组';
    if (!acc[key]) acc[key] = [];
    acc[key].push(exam);
    return acc;
  }, {});

  const sortedYears = Object.keys(groupedByYear).sort((a, b) => {
    if (a === '未分组') return 1;
    if (b === '未分组') return -1;
    return Number(b) - Number(a);
  });

  return (
    <div className="max-w-5xl mx-auto p-6 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">试卷记录库</h2>
           <p className="text-slate-500 text-sm mt-1">上传 PDF (高清原生渲染)，无需担心浏览器拦截，即刻开始刷题。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50/60 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-medium"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            批量导入真题
          </button>
          <button
            onClick={openModal}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            新建六级刷题
          </button>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-lg font-medium text-slate-900">开始你的第一次刷题</h3>
          <p className="text-slate-500 mt-2 text-sm">点击右上角新建，系统会为你准备好答题纸</p>
          <button
            onClick={openModal}
            className="mt-6 px-6 py-2 bg-indigo-50 text-indigo-700 font-medium rounded-full hover:bg-indigo-100 transition-colors"
          >
            立即创建
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedYears.map((yearKey) => {
            const examsInYear = groupedByYear[yearKey];
            const isCollapsed = !!collapsedYears[yearKey];
            return (
              <div key={yearKey}>
                <div
                  className="flex items-center justify-between mb-2 cursor-pointer select-none"
                  onClick={() =>
                    setCollapsedYears((prev) => ({
                      ...prev,
                      [yearKey]: !prev[yearKey],
                    }))
                  }
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 tracking-wide uppercase">
                    <ChevronRight
                      className={`h-3 w-3 transition-transform ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                    <span>
                      {yearKey === '未分组' ? '未识别年份' : `${yearKey} 年真题`}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {examsInYear.length} 套
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {examsInYear.map((exam) => {
                    const totalItems = 55 + 2;
                    let answeredCount = 0;
                    if (exam.userAnswers) {
                      for (let i = 1; i <= 55; i += 1) {
                        if (exam.userAnswers[i]) answeredCount += 1;
                      }
                      if (
                        exam.userAnswers.writing &&
                        exam.userAnswers.writing.trim().length > 10
                      ) {
                        answeredCount += 1;
                      }
                      if (
                        exam.userAnswers.translation &&
                        exam.userAnswers.translation.trim().length > 10
                      ) {
                        answeredCount += 1;
                      }
                    }

                    const progress = Math.round(
                      (answeredCount / totalItems) * 100
                    );
                    const createdAtMs =
                      typeof exam.createdAt === 'number'
                        ? exam.createdAt
                        : exam.createdAt && exam.createdAt.seconds
                        ? exam.createdAt.seconds * 1000
                        : Date.now();
                    const date = new Date(createdAtMs).toLocaleDateString();

                    return (
                      <div
                        key={exam.id}
                        onClick={() => onOpen(exam)}
                        className="bg-white p-5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex flex-col space-y-1">
                            <h3 className="font-semibold text-slate-800 line-clamp-1 text-lg group-hover:text-indigo-600 transition-colors">
                              {exam.title}
                            </h3>
                            {exam.sourceFileName && (
                              <p className="text-[11px] text-slate-400 truncate max-w-[14rem]">
                                文件：{exam.sourceFileName}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => onDelete(exam.id, e)}
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" /> {date}
                          </span>
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                            标准六级
                          </span>
                        </div>

                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-right text-indigo-600 font-medium">
                          {progress}% 完成
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">创建新试卷</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">试卷名称</label>
                <input
                  autoFocus
                  type="text"
                  required
                  placeholder="例如：2023年6月 第一套"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-500">
                <p className="font-medium text-slate-700 mb-1">系统将自动生成标准答题卡：</p>
                <ul className="list-disc pl-4 space-y-1">
                   <li>Part I: 写作 (30min)</li>
                   <li>Part II: 听力 (25min, 25题)</li>
                   <li>Part III: 阅读 (40min, 30题)</li>
                   <li>Part IV: 翻译 (30min)</li>
                </ul>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md text-sm"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                >
                  开始做题
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              批量导入真题 PDF
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              一次选择多份 PDF 文件，系统会根据文件名自动生成试卷卡片，并尝试从文件名中识别年份进行分组。
            </p>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col items-center justify-center text-center mb-4">
              <Upload className="h-8 w-8 text-indigo-400 mb-2" />
              <p className="text-sm text-slate-700 mb-1">
                选择或拖拽多个 PDF 到这里
              </p>
              <p className="text-xs text-slate-400 mb-3">
                建议使用包含年份的文件名，例如：2023年12月 六级真题 第一套.pdf
              </p>
              <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 text-sm font-medium">
                选择 PDF 文件
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={handleBulkFilesSelected}
                />
              </label>
            </div>
            <div className="flex justify-end space-x-3 mt-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- PDF Viewer Component (Custom PDF.js implementation) ---
const PdfViewer = ({ fileUrl, pdfLibLoaded, annotations = {}, onAnnotationsChange }) => {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(2.0); // Default 150%
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [tool, setTool] = useState('none'); // 'none' | 'pen' | 'highlight'
  const [penColor, setPenColor] = useState('red'); // 'red' | 'blue'

  // Load Document
  useEffect(() => {
    if (!fileUrl || !pdfLibLoaded || !window.pdfjsLib) return;

    const loadPdf = async () => {
      try {
        setRendering(true);
        setError(null);
        const loadingTask = window.pdfjsLib.getDocument(fileUrl);
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setRendering(false);
      } catch (err) {
        console.error("PDF Load Error:", err);
        setError("无法解析 PDF，请确保文件未损坏。");
        setRendering(false);
      }
    };
    loadPdf();
  }, [fileUrl, pdfLibLoaded]);

  // Render Page with HiDPI / Retina Support
  useEffect(() => {
    if (!pdfDoc) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);

        // --- HiDPI FIX START ---
        // 1. Get the device pixel ratio (e.g. 2 for Retina screens, 1 for standard)
        const baseDpr = window.devicePixelRatio || 1;
        // Extra quality boost for crisper text; clamp to avoid huge canvases
        const effectiveDpr = Math.min(baseDpr * 1.5, 4);

        // 2. Calculate the desired viewport at the user's scale
        const viewport = page.getViewport({ scale: scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');

        // 3. Set the CSS (visual) dimensions (what it looks like on screen)
        // This ensures the element takes up the correct amount of layout space
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        // 4. Set the internal bitmap dimensions (physical pixels)
        // Scale this by the DPR to ensure we have enough pixels for a sharp image
        canvas.width = Math.floor(viewport.width * effectiveDpr);
        canvas.height = Math.floor(viewport.height * effectiveDpr);

        // 5. Create a transform to scale the vector drawing commands up to the new bitmap size
        // This maps the 1x coordinate system of the PDF to the 2x (or nx) coordinate system of the canvas
        const transform = [effectiveDpr, 0, 0, effectiveDpr, 0, 0];

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform // Apply the high-res scaling
        };
        // --- HiDPI FIX END ---

        await page.render(renderContext).promise;

        // Keep overlay canvas in sync with the main canvas size
        const overlay = overlayRef.current;
        if (overlay) {
          overlay.style.width = canvas.style.width;
          overlay.style.height = canvas.style.height;
          overlay.width = canvas.width;
          overlay.height = canvas.height;
        }
      } catch (err) {
        console.error("Render error:", err);
      }
    };

    renderPage();
  }, [pdfDoc, pageNum, scale]);

  // Redraw annotation overlay when strokes / zoom / page change
  useEffect(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas) return;

    // Ensure overlay matches canvas size
    overlay.style.width = canvas.style.width;
    overlay.style.height = canvas.style.height;
    overlay.width = canvas.width;
    overlay.height = canvas.height;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pageStrokes = annotations[pageNum] || [];
    const strokesToDraw =
      isDrawing &&
      currentStroke &&
      currentStroke.points &&
      currentStroke.points.length
        ? [...pageStrokes, currentStroke]
        : pageStrokes;

    if (!strokesToDraw.length) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseLineWidth = Math.max(2.2, overlay.width / 720);

    const drawStroke = (stroke) => {
      const pts = stroke.points;
      if (!pts || pts.length < 2) return;

      const type = stroke.type || 'pen';
      const color = stroke.color || 'red';

      if (type === 'highlight') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)'; // yellow-400 with transparency
        ctx.lineWidth = 5 * baseLineWidth;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle =
          color === 'blue'
            ? 'rgba(37, 99, 235, 0.95)' // blue-600
            : 'rgba(239, 68, 68, 0.95)'; // red-500
        ctx.lineWidth = 2.2 * baseLineWidth;
      }

      const w = overlay.width;
      const h = overlay.height;

      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);

      // 使用二次贝塞尔曲线让笔迹更顺滑
      for (let i = 1; i < pts.length - 1; i += 1) {
        const curr = pts[i];
        const next = pts[i + 1];
        const cx = curr.x * w;
        const cy = curr.y * h;
        const mx = ((curr.x + next.x) / 2) * w;
        const my = ((curr.y + next.y) / 2) * h;
        ctx.quadraticCurveTo(cx, cy, mx, my);
      }

      // 最后一段
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * w, last.y * h);

      ctx.stroke();
    };

    strokesToDraw.forEach(drawStroke);

    ctx.globalCompositeOperation = 'source-over';
  }, [annotations, pageNum, scale, isDrawing, currentStroke]);

  const getPointerPos = (event) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const isTouch = 'touches' in event;
    const clientX = isTouch ? event.touches[0].clientX : event.clientX;
    const clientY = isTouch ? event.touches[0].clientY : event.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return { x, y };
  };

  const eraseAtPoint = (pos) => {
    if (!onAnnotationsChange) return;
    onAnnotationsChange((prev = {}) => {
      const pageStrokes = prev[pageNum] || [];
      if (!pageStrokes.length) return prev;

      let eraseIndex = -1;
      let bestDistSq = 0.0025; // 选择阈值，越小越精确

      pageStrokes.forEach((stroke, idx) => {
        const pts = stroke.points || [];
        for (let i = 0; i < pts.length; i += 1) {
          const dx = pos.x - pts[i].x;
          const dy = pos.y - pts[i].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            eraseIndex = idx;
          }
        }
      });

      if (eraseIndex === -1) return prev;
      const nextPageStrokes = [
        ...pageStrokes.slice(0, eraseIndex),
        ...pageStrokes.slice(eraseIndex + 1),
      ];
      return {
        ...prev,
        [pageNum]: nextPageStrokes,
      };
    });
  };

  const handlePointerDown = (event) => {
    if (tool === 'none') return;
    event.preventDefault();
    const pos = getPointerPos(event);
    if (!pos) return;

    if (tool === 'eraser') {
      eraseAtPoint(pos);
      return;
    }

    const stroke = {
      points: [pos],
      lineWidth: 1,
      type: tool,
      color: penColor,
    };
    setCurrentStroke(stroke);
    setIsDrawing(true);
  };

  const handlePointerMove = (event) => {
    if (tool === 'none') return;
    event.preventDefault();
    const pos = getPointerPos(event);
    if (!pos) return;

    if (tool === 'eraser') {
      if (event.buttons & 1) {
        eraseAtPoint(pos);
      }
      return;
    }

    // 笔迹跟手：轻微抖动过滤，但不过度平滑，渲染时再做曲线平滑
    setCurrentStroke((prev) => {
      if (!prev || !prev.points || !prev.points.length) return prev;
      const last = prev.points[prev.points.length - 1];
      const dx = pos.x - last.x;
      const dy = pos.y - last.y;
      const distSq = dx * dx + dy * dy;
      // 仅过滤极小抖动（约 1~2 像素）
      const minDistSq = 0.000004;
      if (distSq < minDistSq) return prev;
      return { ...prev, points: [...prev.points, pos] };
    });
  };

  const finishStroke = () => {
    if (!isDrawing || !currentStroke || !currentStroke.points?.length) {
      setIsDrawing(false);
      setCurrentStroke(null);
      return;
    }
    if (!onAnnotationsChange) {
      setIsDrawing(false);
      setCurrentStroke(null);
      return;
    }
    onAnnotationsChange((prev = {}) => {
      const existing = prev[pageNum] || [];
      return {
        ...prev,
        [pageNum]: [...existing, currentStroke],
      };
    });
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  const changePage = (offset) => {
    setPageNum(prev => Math.min(Math.max(1, prev + offset), numPages));
  };

  const clearCurrentPageAnnotations = () => {
    if (!onAnnotationsChange) return;
    onAnnotationsChange((prev = {}) => {
      if (!prev[pageNum]) return prev;
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });
  };

  if (!pdfLibLoaded) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <Loader className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">初始化 PDF 引擎...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-500 p-8 text-center">
        <AlertCircle className="h-10 w-10 mb-2" />
        <p>{error}</p>
      </div>
    );
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      changePage(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      changePage(1);
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-slate-700"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* PDF Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white shadow-md z-10 shrink-0 border-b border-slate-600">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => changePage(-1)}
            disabled={pageNum <= 1}
            className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="上一页"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-mono min-w-[4rem] text-center bg-slate-900/50 rounded py-0.5 px-2">
             {pageNum} / {numPages || '-'}
          </span>
          <button
            onClick={() => changePage(1)}
            disabled={pageNum >= numPages}
            className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="下一页"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-slate-900/50 rounded px-1">
            <button
              onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="缩小"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs w-10 text-center font-mono">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(5.0, s + 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="放大"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center bg-slate-900/50 rounded px-1 space-x-1">
            <button
              onClick={() =>
                setTool((prev) => (prev === 'pen' ? 'none' : 'pen'))
              }
              className={`flex items-center px-2 py-1 rounded text-xs transition-colors ${
                tool === 'pen'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-200 hover:bg-slate-700'
              }`}
              title="钢笔标记"
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">钢笔</span>
            </button>
            <button
              onClick={() =>
                setTool((prev) => (prev === 'highlight' ? 'none' : 'highlight'))
              }
              className={`hidden sm:flex items-center px-2 py-1 rounded text-xs transition-colors ${
                tool === 'highlight'
                  ? 'bg-amber-300 text-amber-950'
                  : 'text-slate-200 hover:bg-slate-700'
              }`}
              title="高亮划线"
            >
              <span className="w-3 h-3 rounded-sm bg-amber-300 mr-1 border border-amber-400" />
              高亮
            </button>
            <button
              onClick={() =>
                setTool((prev) => (prev === 'eraser' ? 'none' : 'eraser'))
              }
              className={`flex items-center px-2 py-1 rounded text-xs transition-colors ${
                tool === 'eraser'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-200 hover:bg-slate-700'
              }`}
              title="橡皮擦（点按要擦除的标记）"
            >
              <Eraser className="h-3 w-3" />
              <span className="hidden sm:inline ml-1">橡皮</span>
            </button>
            <div className="flex items-center border-l border-slate-700/60 pl-1 ml-0.5 space-x-0.5">
              <button
                onClick={() => setPenColor('red')}
                className={`w-4 h-4 rounded-full border ${
                  penColor === 'red'
                    ? 'border-white ring-1 ring-white'
                    : 'border-slate-500'
                }`}
                style={{ backgroundColor: '#ef4444' }}
                title="红色钢笔"
              />
              <button
                onClick={() => setPenColor('blue')}
                className={`w-4 h-4 rounded-full border ${
                  penColor === 'blue'
                    ? 'border-white ring-1 ring-white'
                    : 'border-slate-500'
                }`}
                style={{ backgroundColor: '#2563eb' }}
                title="蓝色钢笔"
              />
            </div>
            <button
              onClick={clearCurrentPageAnnotations}
              disabled={!(annotations[pageNum] && annotations[pageNum].length)}
              className="p-1.5 rounded text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default"
              title="清除当前页全部标记"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-grow overflow-auto flex justify-center bg-slate-500/50 p-4 sm:p-8">
        <div className="relative shadow-2xl ring-1 ring-black/10">
           <canvas ref={canvasRef} className="block bg-white" />
           <canvas
             ref={overlayRef}
             className={`absolute inset-0 ${
               tool === 'none' ? 'cursor-default' : 'cursor-crosshair'
             }`}
             onMouseDown={handlePointerDown}
             onMouseMove={handlePointerMove}
             onMouseUp={finishStroke}
             onMouseLeave={finishStroke}
             onTouchStart={handlePointerDown}
             onTouchMove={handlePointerMove}
             onTouchEnd={finishStroke}
             style={{ touchAction: 'none' }}
           />
        </div>
      </div>
    </div>
  );
};


// --- Workbench Component (The Core Experience) ---
const Workbench = ({ exam, onBack, onAutoSave, pdfLibLoaded }) => {
  const [fileUrl, setFileUrl] = useState(null);
  const [file, setFile] = useState(null); // Keep actual file for reload if needed
  const [answers, setAnswers] = useState(exam.userAnswers || {});
  const [notes, setNotes] = useState(exam.notes || "");
  const [rightPanelWidth, setRightPanelWidth] = useState(32);
  const [activeSection, setActiveSection] = useState('writing');
  const [elapsedSeconds, setElapsedSeconds] = useState(exam.elapsedSeconds || 0);
  const [annotations, setAnnotations] = useState(exam.annotations || {});
  const [timerRunning, setTimerRunning] = useState(true);
  const sectionScrollRef = useRef(null);

  // Debounced Save
  useEffect(() => {
    const timer = setTimeout(() => {
      onAutoSave(exam.id, answers, notes, annotations, elapsedSeconds);
    }, 1000);
    return () => clearTimeout(timer);
  }, [answers, notes, annotations, elapsedSeconds]);

  // Notes are now pure文本（使用 textarea），不再依赖 contentEditable DOM 同步

  // When switching between tabs (writing/listening/reading/...), always scroll
  // the section container back to top so the header/bar不会出现位置偏移的错觉。
  useEffect(() => {
    const el = sectionScrollRef.current;
    if (el && typeof el.scrollTop === 'number') {
      el.scrollTop = 0;
    }
  }, [activeSection]);

  // Simple exam timer (counts from 0 when 打开此试卷)
  useEffect(() => {
    if (!timerRunning) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timerRunning]);

  // Load stored PDF for this exam (from IndexedDB) on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await loadPdfForExam(exam.id);
      if (cancelled || !record) return;
      let blob = record.blob;
      if (!(blob instanceof Blob)) {
        blob = new Blob([blob], { type: record.type || 'application/pdf' });
      }
      const url = URL.createObjectURL(blob);
      if (!cancelled) {
        setFileUrl(url);
        setFile(blob);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam.id]);

  // Handle File Upload
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Need array buffer for PDF.js typically, but passing URL works with standard `getDocument`
      // if passing the File object directly or ArrayBuffer.
      // However, for blob URLs, it usually works fine too.
      const url = URL.createObjectURL(selectedFile);
      setFileUrl(url);
      setFile(selectedFile);
      savePdfForExam(exam.id, selectedFile);
    }
  };

  const updateAnswer = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const toggleChoice = (qNum, option) => {
    setAnswers(prev => {
      const current = prev[qNum];
      if (current === option) {
        const next = { ...prev };
        delete next[qNum];
        return next;
      }
      return { ...prev, [qNum]: option };
    });
  };

  return (
    <div className="h-full flex flex-row overflow-hidden bg-stone-100">

      {/* LEFT PANEL: PDF Viewer */}
      <div
        className="flex flex-col h-full bg-slate-800 relative transition-all duration-100"
        style={{ width: `${100 - rightPanelWidth}%` }}
      >
        {!fileUrl ? (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-slate-500 bg-slate-200">
             <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md border border-slate-300">
                <Upload className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-2">上传试卷 PDF</h3>
                <p className="text-sm mb-6">采用原生 JS 渲染，高清无损，永不被拦截。</p>
                <label className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 shadow transition-colors font-medium">
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                  <span>选择 PDF 试卷</span>
                </label>
             </div>
          </div>
        ) : (
          <div className="w-full h-full relative group flex flex-col">
             <PdfViewer
               fileUrl={fileUrl}
               pdfLibLoaded={pdfLibLoaded}
               annotations={annotations}
               onAnnotationsChange={setAnnotations}
             />

             {/* Floating Re-upload Button */}
             <div className="absolute bottom-6 left-6 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <label className="flex items-center px-4 py-2 bg-slate-900/90 text-white text-xs rounded-full cursor-pointer hover:bg-black shadow-xl backdrop-blur-sm border border-slate-700 font-medium">
                  <Upload className="h-3 w-3 mr-2" />
                  换一份
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                </label>
             </div>
          </div>
        )}
      </div>

      {/* RESIZER HANDLE */}
      <div className="w-1 bg-slate-300 hover:bg-indigo-400 cursor-col-resize flex items-center justify-center z-20 hover:w-2 transition-all"
           onMouseDown={(e) => {
             const startX = e.clientX;
             const startWidth = rightPanelWidth;
             const handleMouseMove = (moveEvent) => {
               const delta = startX - moveEvent.clientX;
               const totalWidth = document.body.clientWidth;
               const newWidth = startWidth + (delta / totalWidth) * 100;
               if (newWidth > 25 && newWidth < 75) setRightPanelWidth(newWidth);
             };
             const handleMouseUp = () => {
               document.removeEventListener('mousemove', handleMouseMove);
               document.removeEventListener('mouseup', handleMouseUp);
             };
             document.addEventListener('mousemove', handleMouseMove);
             document.addEventListener('mouseup', handleMouseUp);
           }}
      >
        <div className="w-1 h-8 bg-slate-400 rounded-full"></div>
      </div>

      {/* RIGHT PANEL: Tools (Answer Sheet & Notes) */}
      <div
        className="flex flex-col h-full bg-white border-l border-slate-200 shadow-xl z-20"
        style={{ width: `${rightPanelWidth}%` }}
      >
        {/* Right panel header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              CET-6 Focus · Answer Sheet
            </span>
            <span className="text-sm font-medium text-slate-800 truncate max-w-[12rem] sm:max-w-xs">
              {exam.title}
            </span>
            <div className="mt-0.5 inline-flex items-center text-[11px] text-slate-400 gap-2">
              <span className="inline-flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                已用时{' '}
                {`${String(Math.floor(elapsedSeconds / 60)).padStart(
                  2,
                  '0',
                )}:${String(elapsedSeconds % 60).padStart(2, '0')}`}
              </span>
              <button
                type="button"
                onClick={() => setTimerRunning((prev) => !prev)}
                className="px-1.5 py-0.5 rounded-full border border-slate-300 text-[10px] text-slate-600 hover:bg-slate-100 bg-white"
              >
                {timerRunning ? '暂停' : '继续'}
              </button>
            </div>
          </div>
          <button
            onClick={onBack}
            className="flex items-center px-2.5 py-1.5 bg-slate-900 text-white text-[11px] sm:text-xs rounded-full hover:bg-black transition-colors shadow-sm"
          >
            <ArrowUpCircle className="h-3 w-3 mr-1" />
            返回题库
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
           {[
             { id: 'writing', icon: Feather, label: '作文' },
             { id: 'listening', icon: Headphones, label: '听力' },
             { id: 'reading', icon: BookOpen, label: '阅读' },
             { id: 'translation', icon: Languages, label: '翻译' },
             { id: 'notes', icon: PenLine, label: '草稿' },
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveSection(tab.id)}
               className={`
                 flex-1 py-3 px-2 min-w-[4rem] text-xs sm:text-sm font-medium flex flex-col sm:flex-row items-center justify-center transition-colors border-b-2
                 ${activeSection === tab.id
                   ? 'text-indigo-600 border-indigo-600 bg-white'
                   : 'text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-700'
                 }
               `}
             >
               <tab.icon className="h-4 w-4 sm:mr-2 mb-1 sm:mb-0" />
               {tab.label}
             </button>
           ))}
        </div>

        {/* Tab Content */}
        <div className="flex-grow overflow-hidden flex flex-col bg-slate-50/30 p-4 sm:p-6">

           {/* WRITING SECTION */}
           {activeSection === 'writing' && (
             <div
               ref={sectionScrollRef}
               className="flex-grow flex flex-col overflow-y-auto"
             >
                <div className="flex justify-between items-center mb-3">
                   <h3 className="font-bold text-slate-800 flex items-center">
                     <Feather className="h-4 w-4 mr-2 text-indigo-500" />
                     Part I Writing
                   </h3>
                   <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">建议用时 30 Min</span>
                </div>
                <div className="flex-grow bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col relative focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                   <textarea
                     value={answers['writing'] || ''}
                     onChange={(e) => updateAnswer('writing', e.target.value)}
                     className="flex-grow w-full h-full resize-none focus:outline-none text-slate-700 font-serif leading-relaxed text-lg"
                     placeholder="在这里输入你的作文..."
                   />
                   <div className="absolute bottom-2 right-4 text-xs text-slate-300 pointer-events-none bg-white/80 px-2 rounded">
                      词数统计: {answers['writing']?.trim().split(/\s+/).filter(Boolean).length || 0}
                   </div>
                </div>
             </div>
           )}

           {/* LISTENING SECTION */}
           {activeSection === 'listening' && (
             <div
               ref={sectionScrollRef}
               className="flex-grow overflow-y-auto"
             >
                <div className="flex justify-between items-center mb-3 bg-slate-50 py-2 border-b border-slate-200 px-2 sm:px-4">
                   <h3 className="font-bold text-slate-800 flex items-center">
                     <Headphones className="h-4 w-4 mr-2 text-indigo-500" />
                     Part II Listening
                   </h3>
                   <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">25 Min / 25 题</span>
                </div>

                <div className="space-y-6">
                  {/* Section A */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Section A: News Reports (1-7)</h4>
                    <div className="space-y-1">
                       {Array.from({length: 7}, (_, i) => i + 1).map(num => (
                         <QuestionRow key={num} num={num} answers={answers} toggleChoice={toggleChoice} />
                       ))}
                    </div>
                  </div>
                  {/* Section B */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Section B: Conversations (8-15)</h4>
                    <div className="space-y-1">
                       {Array.from({length: 8}, (_, i) => i + 8).map(num => (
                         <QuestionRow key={num} num={num} answers={answers} toggleChoice={toggleChoice} />
                       ))}
                    </div>
                  </div>
                  {/* Section C */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Section C: Passages (16-25)</h4>
                    <div className="space-y-1">
                       {Array.from({length: 10}, (_, i) => i + 16).map(num => (
                         <QuestionRow key={num} num={num} answers={answers} toggleChoice={toggleChoice} />
                       ))}
                    </div>
                  </div>
                </div>
             </div>
           )}

           {/* READING SECTION */}
           {activeSection === 'reading' && (
             <div
               ref={sectionScrollRef}
               className="flex-grow overflow-y-auto"
             >
                <div className="flex justify-between items-center mb-3 bg-slate-50 py-2 border-b border-slate-200 px-2 sm:px-4">
                   <h3 className="font-bold text-slate-800 flex items-center">
                     <BookOpen className="h-4 w-4 mr-2 text-indigo-500" />
                     Part III Reading
                   </h3>
                   <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">40 Min / 30 题</span>
                </div>

                <div className="space-y-6">
                  {/* Section A */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 border-b border-slate-100 pb-2">Section A: Banked Cloze (26-35)</h4>
                    <div className="bg-amber-50 text-amber-700 px-3 py-2 rounded text-xs mb-3 flex items-start">
                       <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                       选词填空 (15选10)，注意词性搭配
                    </div>
                    <div className="space-y-1">
                       {Array.from({length: 10}, (_, i) => i + 26).map(num => (
                         <div key={num} className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded px-2 transition-colors">
                           <span className="w-8 text-sm font-mono font-bold text-slate-500 mb-2 sm:mb-0">{num}.</span>
                           <div className="flex flex-wrap gap-1.5">
                              {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'].map(opt => {
                                 const isSelected = answers[num] === opt;
                                 return (
                                    <button
                                      key={opt}
                                      onClick={() => toggleChoice(num, opt)}
                                      className={`
                                        w-7 h-7 text-[10px] rounded border flex items-center justify-center transition-all
                                        ${isSelected
                                          ? 'bg-indigo-600 border-indigo-600 text-white shadow'
                                          : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600'
                                        }
                                      `}
                                    >
                                      {opt}
                                    </button>
                                 )
                              })}
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  {/* Section B */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Section B: Matching (36-45)</h4>
                    <div className="space-y-1">
                       {Array.from({length: 10}, (_, i) => i + 36).map(num => (
                         <QuestionRow key={num} num={num} answers={answers} toggleChoice={toggleChoice} options={['A','B','C','D','E','F','G','H','I','J','K','L','M']} />
                       ))}
                    </div>
                  </div>

                  {/* Section C */}
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Section C: Careful Reading (46-55)</h4>
                    <div className="space-y-1">
                       {Array.from({length: 10}, (_, i) => i + 46).map(num => (
                         <QuestionRow key={num} num={num} answers={answers} toggleChoice={toggleChoice} />
                       ))}
                    </div>
                  </div>
                </div>
             </div>
           )}

           {/* TRANSLATION SECTION */}
           {activeSection === 'translation' && (
             <div
               ref={sectionScrollRef}
               className="flex-grow flex flex-col overflow-y-auto"
             >
                <div className="flex justify-between items-center mb-3">
                   <h3 className="font-bold text-slate-800 flex items-center">
                     <Languages className="h-4 w-4 mr-2 text-indigo-500" />
                     Part IV Translation
                   </h3>
                   <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">建议用时 30 Min</span>
                </div>
                <div className="flex-grow bg-white rounded-lg border border-slate-200 shadow-sm p-4 relative focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                   <textarea
                     value={answers['translation'] || ''}
                     onChange={(e) => updateAnswer('translation', e.target.value)}
                     className="flex-grow w-full h-full resize-none focus:outline-none text-slate-700 font-serif leading-relaxed text-lg"
                     placeholder="在这里输入你的翻译..."
                   />
                </div>
             </div>
           )}

           {/* NOTES SECTION */}
           {activeSection === 'notes' && (
             <div
               ref={sectionScrollRef}
               className="flex-grow flex flex-col bg-yellow-50/60"
             >
                <div className="p-3 border-b border-yellow-200 bg-yellow-100/80 flex justify-between items-center">
                   <span className="text-xs font-bold text-yellow-900 uppercase tracking-wide flex items-center">
                     <PenLine className="h-3 w-3 mr-2" />
                     草稿纸 & 单词本
                     <span className="ml-2 text-[10px] font-normal text-yellow-800/80 hidden sm:inline">
                       文本会自动保存
                     </span>
                   </span>
                   <button
                     onClick={() => setNotes('')}
                     className="text-yellow-800/80 hover:text-yellow-900 p-1 rounded hover:bg-yellow-200/80"
                     title="清空全部"
                   >
                     <Eraser className="h-4 w-4" />
                   </button>
                </div>
                <div className="flex-grow p-3 flex flex-col gap-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="flex-grow w-full rounded-lg border border-yellow-200 bg-white/80 p-3 text-sm text-slate-800 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-yellow-300"
                    placeholder="在这里随手记笔记、单词或长难句。文本会自动保存。"
                  />
                  {/* TODO: optional image preview area if later we store images separately */}
                </div>
             </div>
           )}

           {/* Bottom Bar */}
           <div className="bg-white border-t border-slate-200 p-3 flex justify-end items-center text-[11px] sm:text-xs text-slate-500 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
             <span className="flex items-center text-green-600">
               <CheckCircle className="h-3 w-3 mr-1" />
               已自动保存至本地
             </span>
           </div>
        </div>
      </div>

    </div>
  );
};

// --- Helper Component for Question Rows ---
const QuestionRow = ({ num, answers, toggleChoice, options = ['A', 'B', 'C', 'D'] }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded px-2 transition-colors group">
    <span className="w-8 text-sm font-mono font-bold text-slate-400 group-hover:text-slate-600 transition-colors">{num}.</span>
    <div className="flex space-x-2 sm:space-x-4">
       {options.map(opt => {
         const isSelected = answers[num] === opt;
         return (
           <button
             key={opt}
             onClick={() => toggleChoice(num, opt)}
             className={`
                w-8 h-8 rounded-full text-xs font-medium border flex items-center justify-center transition-all
                ${isSelected
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-105'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
                }
             `}
           >
             {opt}
           </button>
         );
       })}
    </div>
  </div>
);
