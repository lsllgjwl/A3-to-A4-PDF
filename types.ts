
export interface ProcessingStatus {
  step: 'idle' | 'loading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
}

export interface SplitOptions {
  orientation: 'auto' | 'vertical' | 'horizontal';
  splitRatio: number; // 默认比例（用于全部页或奇数页）
  evenSplitRatio?: number; // 偶数页比例
  useDualRatios: boolean; // 是否开启奇偶异值
  mergeToSingleFile: boolean;
  // 页码配置
  enablePageNumbering: boolean;
  startingPageNumber: number; // 起始数字 (例如从 1 开始记数)
  numberingStartFromPageIndex: number; // 从原始 A3 的第几页开始添加页码 (0-indexed)
  numberingSide: 'both' | 'first' | 'second'; // 哪一侧添加页码
}

export enum PageOrientation {
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait'
}
