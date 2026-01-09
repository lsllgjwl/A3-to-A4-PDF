
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './components/Button';
import { splitA3ToA4 } from './services/pdfService';
import { ProcessingStatus, SplitOptions } from './types';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs`;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [splitMode, setSplitMode] = useState<SplitOptions['orientation']>('auto');
  const [splitRatio, setSplitRatio] = useState<number>(0.5);
  const [evenSplitRatio, setEvenSplitRatio] = useState<number>(0.5);
  const [useDualRatios, setUseDualRatios] = useState<boolean>(false);
  
  // Page Numbering states
  const [enablePageNumbering, setEnablePageNumbering] = useState<boolean>(false);
  const [startingPageNumber, setStartingPageNumber] = useState<number>(1);
  const [numberingStartFromPageIndex, setNumberingStartFromPageIndex] = useState<number>(0);
  const [numberingSide, setNumberingSide] = useState<SplitOptions['numberingSide']>('both');
  
  const [status, setStatus] = useState<ProcessingStatus>({
    step: 'idle',
    progress: 0,
    message: ''
  });
  const [processedFileUrl, setProcessedFileUrl] = useState<string | null>(null);
  
  // Preview states
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<{width: number, height: number} | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapperRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setProcessedFileUrl(null);
      setPreviewInfo(null);
      setSplitRatio(0.5); 
      setEvenSplitRatio(0.5);
      setCurrentPage(1);
      setStatus({ step: 'idle', progress: 0, message: '准备就绪' });
    } else if (selectedFile) {
      alert('请上传有效的 PDF 文件。');
    }
  };

  useEffect(() => {
    if (!file) return;

    let isMounted = true;
    let renderTask: any = null;

    const renderPreview = async () => {
      setPreviewLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        if (!isMounted) return;
        setTotalPages(pdf.numPages);
        
        const pageToLoad = Math.min(Math.max(1, currentPage), pdf.numPages);
        const page = await pdf.getPage(pageToLoad);
        const viewport = page.getViewport({ scale: 1.0 });
        
        if (isMounted) {
          setPreviewInfo({ width: viewport.width, height: viewport.height });
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        if (canvasRef.current && previewWrapperRef.current && isMounted) {
          const wrapper = previewWrapperRef.current;
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          
          const containerWidth = wrapper.clientWidth - 80;
          const containerHeight = wrapper.clientHeight - 80;
          
          const scaleX = containerWidth / viewport.width;
          const scaleY = containerHeight / viewport.height;
          const fitScale = Math.min(scaleX, scaleY, 1.2); 
          
          const dpr = window.devicePixelRatio || 1;
          const scaledViewport = page.getViewport({ scale: fitScale });

          canvas.width = scaledViewport.width * dpr;
          canvas.height = scaledViewport.height * dpr;
          canvas.style.width = `${scaledViewport.width}px`;
          canvas.style.height = `${scaledViewport.height}px`;

          if (context) {
            context.scale(dpr, dpr);
            renderTask = page.render({
              canvasContext: context,
              viewport: scaledViewport
            });
            await renderTask.promise;
          }
        }
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Preview error:', err);
        }
      } finally {
        if (isMounted) setPreviewLoading(false);
      }
    };

    renderPreview();

    return () => {
      isMounted = false;
      if (renderTask) renderTask.cancel();
    };
  }, [file, currentPage]);

  const handleProcess = async () => {
    if (!file) return;

    try {
      setStatus({ step: 'processing', progress: 0, message: '正在进行高级分割...' });
      
      const options: SplitOptions = {
        orientation: splitMode,
        splitRatio: splitRatio,
        evenSplitRatio: evenSplitRatio,
        useDualRatios: useDualRatios,
        mergeToSingleFile: true,
        enablePageNumbering: enablePageNumbering,
        startingPageNumber: startingPageNumber,
        numberingStartFromPageIndex: numberingStartFromPageIndex,
        numberingSide: numberingSide
      };

      const processedBytes = await splitA3ToA4(file, options, (progress) => {
        setStatus(prev => ({ ...prev, progress, message: `处理进度: ${Math.round(progress)}%` }));
      });

      const blob = new Blob([processedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setProcessedFileUrl(url);
      setStatus({ step: 'completed', progress: 100, message: '转换成功完成！' });
    } catch (error) {
      console.error(error);
      setStatus({ step: 'error', progress: 0, message: '处理 PDF 时发生错误。' });
    }
  };

  const handleDownload = () => {
    if (processedFileUrl) {
      const link = document.createElement('a');
      link.href = processedFileUrl;
      link.download = `split_with_numbers_${file?.name || 'document.pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isVerticalSplit = splitMode === 'auto' 
    ? (previewInfo ? previewInfo.width > previewInfo.height : true)
    : splitMode === 'vertical';

  const isCurrentPageEven = currentPage % 2 === 0;
  const currentActiveRatio = (useDualRatios && isCurrentPageEven) ? evenSplitRatio : splitRatio;

  // Calculate simulated page numbers for preview
  const getSimulatedPageNumbers = () => {
    if (!enablePageNumbering || (currentPage - 1) < numberingStartFromPageIndex) return { p1: null, p2: null };
    
    // We need to count how many pages were actually numbered before this one
    let count = startingPageNumber;
    const partsPerA3 = numberingSide === 'both' ? 2 : 1;
    const skippedA3Pages = numberingStartFromPageIndex;
    const currentA3PageIndex = currentPage - 1;
    
    // Total pages added before current page
    const previousNumberedA3Pages = Math.max(0, currentA3PageIndex - skippedA3Pages);
    count += (previousNumberedA3Pages * partsPerA3);
    
    const p1 = (numberingSide === 'both' || numberingSide === 'first') ? count : null;
    const p2 = (numberingSide === 'both') ? count + 1 : (numberingSide === 'second' ? count : null);
    
    return { p1, p2 };
  };

  const { p1: previewPage1Num, p2: previewPage2Num } = getSimulatedPageNumbers();

  const goToPrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-3xl w-full text-center mb-10">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl mb-2">
          A3 转 A4 PDF 工具
        </h1>
        <p className="text-lg text-slate-600">
          智能分割、奇偶独立比例、自定义自动页码
        </p>
      </div>

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[calc(100vh-200px)]">
            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group cursor-pointer border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center transition-all hover:border-indigo-400 hover:bg-indigo-50 min-h-[300px]"
              >
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-lg font-bold text-slate-800 mb-2 text-center">点击或拖拽上传 PDF</p>
                <p className="text-sm text-slate-500 text-center">支持建筑图纸、试卷等 A3 文档</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* File Info */}
                <div className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm mr-3">
                    <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M7 2a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V8l-6-6H7zm5 7V3.5L17.5 9H12z" />
                    </svg>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button 
                    onClick={() => {setFile(null); setProcessedFileUrl(null); setStatus({ step: 'idle', progress: 0, message: '' }); setPreviewInfo(null);}}
                    className="p-1.5 hover:bg-rose-100 rounded-full transition-colors text-slate-400 hover:text-rose-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l18 18" />
                    </svg>
                  </button>
                </div>

                {/* 1. Split Configuration */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">1. 分割模式</h3>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => setSplitMode('auto')}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${
                          splitMode === 'auto' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        ⚡ 智能自动识别方向
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSplitMode('vertical')}
                          className={`px-3 py-2 text-[11px] font-bold rounded-lg transition-all border ${
                            splitMode === 'vertical' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          垂直 (左右)
                        </button>
                        <button
                          onClick={() => setSplitMode('horizontal')}
                          className={`px-3 py-2 text-[11px] font-bold rounded-lg transition-all border ${
                            splitMode === 'horizontal' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          水平 (上下)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-600">奇偶页独立比例</label>
                    <button 
                      onClick={() => setUseDualRatios(!useDualRatios)}
                      className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-200 ${useDualRatios ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`bg-white w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${useDualRatios ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="space-y-6 pt-2">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600">
                          {useDualRatios ? '奇数 A3 比例' : '统一分割比例'}
                        </label>
                        <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {Math.round(splitRatio * 100)}%
                        </span>
                      </div>
                      <input 
                        type="range" min="0.1" max="0.9" step="0.01" 
                        value={splitRatio} 
                        onChange={(e) => setSplitRatio(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    {useDualRatios && (
                      <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-emerald-600">
                            偶数 A3 比例
                          </label>
                          <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            {Math.round(evenSplitRatio * 100)}%
                          </span>
                        </div>
                        <input 
                          type="range" min="0.1" max="0.9" step="0.01" 
                          value={evenSplitRatio} 
                          onChange={(e) => setEvenSplitRatio(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          style={{ accentColor: '#10b981' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Page Numbering Settings */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16" />
                       </svg>
                       2. 页码设置
                    </h3>
                    <button 
                      onClick={() => setEnablePageNumbering(!enablePageNumbering)}
                      className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors duration-200 ${enablePageNumbering ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`bg-white w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${enablePageNumbering ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {enablePageNumbering && (
                    <div className="space-y-4 pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                      
                      <div className="space-y-3">
                        <label className="text-[11px] font-bold text-slate-600 block">页码位置</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'first', label: isVerticalSplit ? '仅左侧' : '仅上方' },
                            { id: 'second', label: isVerticalSplit ? '仅右侧' : '仅下方' },
                            { id: 'both', label: '双侧添加' }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setNumberingSide(opt.id as any)}
                              className={`py-1.5 px-1 text-[10px] font-bold rounded border transition-all ${
                                numberingSide === opt.id ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                         <label className="text-[11px] font-bold text-slate-600">起始记数</label>
                         <input 
                          type="number" min="1"
                          value={startingPageNumber}
                          onChange={(e) => setStartingPageNumber(parseInt(e.target.value) || 1)}
                          className="w-20 px-2 py-1 text-xs font-bold border border-slate-200 rounded bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                         />
                      </div>

                      <div className="flex items-center justify-between">
                         <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-slate-600 block">从第几张 A3 开始记数</label>
                            <span className="text-[9px] text-slate-400 font-medium">跳过前面的封面或目录页</span>
                         </div>
                         <input 
                          type="number" min="1" max={totalPages}
                          value={numberingStartFromPageIndex + 1}
                          onChange={(e) => setNumberingStartFromPageIndex(Math.max(0, (parseInt(e.target.value) || 1) - 1))}
                          className="w-20 px-2 py-1 text-xs font-bold border border-slate-200 rounded bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                         />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  {status.step === 'completed' && processedFileUrl ? (
                    <div className="space-y-3">
                      <Button onClick={handleDownload} variant="secondary" className="w-full h-14 text-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        下载转换结果
                      </Button>
                      <button 
                        onClick={() => {setFile(null); setProcessedFileUrl(null); setStatus({step:'idle', progress:0, message:''}); setPreviewInfo(null);}}
                        className="w-full py-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        处理下一个文件
                      </button>
                    </div>
                  ) : (
                    <Button 
                      onClick={handleProcess} 
                      isLoading={status.step === 'processing'}
                      disabled={status.step === 'processing'}
                      className="w-full h-14 text-lg"
                    >
                      {status.step === 'processing' ? '正在渲染...' : '生成 A4 并添加页码'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Preview */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[600px]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                预览 A3 第 {currentPage} 页
              </h3>
              
              {file && totalPages > 1 && (
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={goToPrevPage}
                    disabled={currentPage <= 1 || previewLoading}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-[11px] font-bold text-slate-500 px-2 min-w-[80px] text-center">
                    {currentPage} / {totalPages}
                  </span>
                  <button 
                    onClick={goToNextPage}
                    disabled={currentPage >= totalPages || previewLoading}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
            {previewInfo && (
              <div className="flex gap-2">
                 <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${isCurrentPageEven && useDualRatios ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {useDualRatios ? (isCurrentPageEven ? '偶数页比例' : '奇数页比例') : '常规比例'}
                </span>
                <span className="text-[10px] bg-slate-800 text-white px-2 py-1 rounded-md font-bold uppercase tracking-tighter">
                  {previewInfo.width > previewInfo.height ? 'Landscape A3' : 'Portrait A3'}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex-1 preview-wrapper overflow-hidden" ref={previewWrapperRef}>
            {!file ? (
              <div className="text-center text-slate-300">
                <svg className="w-24 h-24 mx-auto mb-6 opacity-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3h6v2H9V9zm0 4h6v2H9v-2z" />
                </svg>
                <p className="font-bold">上传 A3 PDF 以启动实时预览</p>
              </div>
            ) : (
              <div className="preview-container relative">
                {previewLoading && (
                   <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">渲染高清预览中...</p>
                   </div>
                )}
                
                <canvas ref={canvasRef} className="block" />
                
                {!previewLoading && (
                  <>
                    <div 
                      className={`split-line ${isVerticalSplit ? 'split-line-v' : 'split-line-h'}`}
                      style={{
                        ...(isVerticalSplit ? { left: `${currentActiveRatio * 100}%` } : { top: `${currentActiveRatio * 100}%` }),
                        borderColor: (useDualRatios && isCurrentPageEven) ? '#10b981' : '#4f46e5'
                      }}
                    ></div>
                    
                    {/* Part Labels & Page Numbers */}
                    {isVerticalSplit ? (
                      <>
                        <div className={`page-label ${isCurrentPageEven && useDualRatios ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ top: '20px', left: '20px' }}>Part 1 (A4)</div>
                        <div className={`page-label ${isCurrentPageEven && useDualRatios ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ top: '20px', right: '20px' }}>Part 2 (A4)</div>
                        {previewPage1Num !== null && (
                          <div className="absolute bottom-4 bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-black text-slate-600 shadow-sm" style={{ left: `${currentActiveRatio * 50}%`, transform: 'translateX(-50%)' }}>
                            Page {previewPage1Num}
                          </div>
                        )}
                        {previewPage2Num !== null && (
                          <div className="absolute bottom-4 bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-black text-slate-600 shadow-sm" style={{ left: `${currentActiveRatio * 100 + (1-currentActiveRatio)*50}%`, transform: 'translateX(-50%)' }}>
                            Page {previewPage2Num}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={`page-label ${isCurrentPageEven && useDualRatios ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ top: '20px', left: '20px' }}>Part 1 (A4)</div>
                        <div className={`page-label ${isCurrentPageEven && useDualRatios ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ bottom: '20px', left: '20px' }}>Part 2 (A4)</div>
                        {previewPage1Num !== null && (
                          <div className="absolute left-1/2 -translate-x-1/2 bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-black text-slate-600 shadow-sm" style={{ top: `${currentActiveRatio * 50}%` }}>
                            Page {previewPage1Num}
                          </div>
                        )}
                        {previewPage2Num !== null && (
                          <div className="absolute left-1/2 -translate-x-1/2 bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-black text-slate-600 shadow-sm" style={{ top: `${currentActiveRatio * 100 + (1-currentActiveRatio)*50}%` }}>
                            Page {previewPage2Num}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="p-3 bg-slate-50 text-[10px] text-slate-400 font-bold text-center uppercase tracking-widest border-t border-slate-100 flex justify-center gap-8">
             <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border-t-2 border-dashed border-indigo-600"></div>
                <span>虚线为切割路径</span>
             </div>
             {enablePageNumbering && (
               <div className="flex items-center gap-1.5 text-indigo-600">
                  <div className="w-2.5 h-2.5 bg-indigo-600 rounded-sm"></div>
                  <span>自动页码预览: {previewPage1Num || '--'}, {previewPage2Num || '--'}</span>
               </div>
             )}
          </div>
        </div>
      </div>
      
      <footer className="mt-12 py-6 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
        Local Processing · No Server Upload · Data Private
      </footer>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
    </div>
  );
};

export default App;
